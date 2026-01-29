/**
 * Google Apps Script for Real-Time Sheet Change Detection
 * 
 * INSTALLATION:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this file's contents
 * 4. Update the CONFIG object below with your values
 * 5. Save and deploy:
 *    - Click "Deploy" > "New deployment"
 *    - Select type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (for webhook to receive requests)
 * 6. Set up the trigger:
 *    - Click the clock icon (Triggers) in the left sidebar
 *    - Add Trigger
 *    - Choose "onEditInstallable" function
 *    - Select "On edit" event type
 *    - Save (authorize when prompted)
 * 
 * SECURITY NOTE:
 * The WEBHOOK_SECRET must match the WEBHOOK_SECRET in your server's .env file.
 * This provides HMAC authentication for webhook requests.
 */

// ============ CONFIGURATION ============
const CONFIG = {
  // Your sync server webhook URL
  WEBHOOK_URL: 'http://localhost:3000/api/webhook/sheets',
  
  // Shared secret for HMAC authentication (must match server's WEBHOOK_SECRET)
  WEBHOOK_SECRET: 'your_webhook_hmac_secret_here',
  
  // Debounce time in milliseconds (to batch rapid edits)
  DEBOUNCE_MS: 50,
  
  // Enable debug logging in Apps Script console
  DEBUG: true,
};
// ========================================

/**
 * Installable trigger for edit events
 * This function is called automatically when any cell is edited
 */
function onEditInstallable(e) {
  try {
    if (!e || !e.range) {
      logDebug('No event or range provided');
      return;
    }

    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const range = e.range;
    
    // Get change details
    const changeData = {
      sheetName: sheetName,
      row: range.getRow(),
      column: range.getColumn(),
      numRows: range.getNumRows(),
      numColumns: range.getNumColumns(),
      a1Notation: range.getA1Notation(),
      oldValue: e.oldValue,
      newValue: e.value,
      editedBy: Session.getActiveUser().getEmail() || 'anonymous',
      timestamp: new Date().toISOString(),
    };

    // For multi-cell edits, get all values
    if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
      changeData.values = range.getValues();
    }

    // Get headers from first row for column mapping
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    changeData.headers = headers;

    // Determine operation type
    if (changeData.row === 1) {
      changeData.operationType = 'HEADER_CHANGE';
    } else if (e.oldValue === undefined && e.value !== undefined) {
      changeData.operationType = 'INSERT';
    } else if (e.oldValue !== undefined && (e.value === undefined || e.value === '')) {
      changeData.operationType = 'DELETE';
    } else {
      changeData.operationType = 'UPDATE';
    }

    // Get the full row data for context
    if (changeData.row > 1) {
      const rowData = sheet.getRange(changeData.row, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowObject = {};
      headers.forEach((header, index) => {
        if (header) {
          rowObject[header] = rowData[index];
        }
      });
      changeData.rowData = rowObject;
    }

    logDebug('Change detected: ' + JSON.stringify(changeData));

    // Debounce rapid edits
    const shouldSend = debounceChange(changeData);
    if (!shouldSend) {
      logDebug('Change debounced, waiting for batch');
      return;
    }

    // Send to webhook
    sendToWebhook(changeData);

  } catch (error) {
    logError('Error in onEditInstallable: ' + error.message);
  }
}

/**
 * Debounce rapid edits by storing pending changes in PropertiesService
 * Returns true if the change should be sent immediately
 */
function debounceChange(changeData) {
  const props = PropertiesService.getScriptProperties();
  const key = 'pending_change_' + changeData.row;
  
  // Store the change
  props.setProperty(key, JSON.stringify({
    data: changeData,
    timestamp: Date.now(),
  }));

  // Set a trigger to process after debounce period
  const existingTrigger = props.getProperty('debounce_trigger_' + changeData.row);
  if (!existingTrigger) {
    // Create a time-based trigger to process the batch
    const trigger = ScriptApp.newTrigger('processDebouncedChange')
      .timeBased()
      .after(CONFIG.DEBOUNCE_MS)
      .create();
    
    props.setProperty('debounce_trigger_' + changeData.row, trigger.getUniqueId());
  }

  return false; // Don't send immediately, wait for debounce
}

/**
 * Process debounced changes (called by time trigger)
 */
function processDebouncedChange() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  
  // Find and process all pending changes
  for (const key in allProps) {
    if (key.startsWith('pending_change_')) {
      try {
        const pending = JSON.parse(allProps[key]);
        
        // Check if debounce period has passed
        if (Date.now() - pending.timestamp >= CONFIG.DEBOUNCE_MS) {
          sendToWebhook(pending.data);
          props.deleteProperty(key);
          
          // Clean up trigger reference
          const triggerKey = key.replace('pending_change_', 'debounce_trigger_');
          props.deleteProperty(triggerKey);
        }
      } catch (e) {
        logError('Error processing debounced change: ' + e.message);
        props.deleteProperty(key);
      }
    }
  }
  
  // Clean up old triggers
  cleanupTriggers();
}

/**
 * Clean up old time-based triggers
 */
function cleanupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'processDebouncedChange') {
      try {
        ScriptApp.deleteTrigger(trigger);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  }
}

/**
 * Send change data to the webhook with HMAC authentication
 */
function sendToWebhook(changeData) {
  try {
    const payload = JSON.stringify(changeData);
    const signature = generateHmacSignature(payload, CONFIG.WEBHOOK_SECRET);

    const options = {
      method: 'POST',
      contentType: 'application/json',
      headers: {
        'X-Webhook-Signature': signature,
        'X-Timestamp': Date.now().toString(),
      },
      payload: payload,
      muteHttpExceptions: true, // Don't throw on non-2xx responses
    };

    logDebug('Sending webhook to: ' + CONFIG.WEBHOOK_URL);
    
    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      logDebug('Webhook sent successfully: ' + responseCode);
    } else {
      logError('Webhook failed with status ' + responseCode + ': ' + responseBody);
    }

  } catch (error) {
    logError('Error sending webhook: ' + error.message);
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook authentication
 */
function generateHmacSignature(payload, secret) {
  const signature = Utilities.computeHmacSha256Signature(payload, secret);
  return Utilities.base64Encode(signature);
}

/**
 * Debug logging helper
 */
function logDebug(message) {
  if (CONFIG.DEBUG) {
    Logger.log('[DEBUG] ' + message);
  }
}

/**
 * Error logging helper
 */
function logError(message) {
  Logger.log('[ERROR] ' + message);
}

/**
 * Manual test function - run this to verify webhook connectivity
 */
function testWebhook() {
  const testData = {
    sheetName: 'Test',
    row: 2,
    column: 1,
    operationType: 'TEST',
    newValue: 'test_value',
    editedBy: Session.getActiveUser().getEmail() || 'test_user',
    timestamp: new Date().toISOString(),
    headers: ['Column1', 'Column2'],
    rowData: { Column1: 'test_value', Column2: 'other_value' },
  };

  sendToWebhook(testData);
  Logger.log('Test webhook sent. Check your server logs.');
}

/**
 * Setup function - run this once to initialize
 */
function setup() {
  Logger.log('=== Google Sheets Sync Setup ===');
  Logger.log('Webhook URL: ' + CONFIG.WEBHOOK_URL);
  Logger.log('Debug mode: ' + CONFIG.DEBUG);
  Logger.log('');
  Logger.log('Next steps:');
  Logger.log('1. Update CONFIG.WEBHOOK_URL with your server URL');
  Logger.log('2. Update CONFIG.WEBHOOK_SECRET to match your server');
  Logger.log('3. Set up an installable trigger for onEditInstallable:');
  Logger.log('   - Click the clock icon (Triggers)');
  Logger.log('   - Add Trigger');
  Logger.log('   - Function: onEditInstallable');
  Logger.log('   - Event: On edit');
  Logger.log('4. Run testWebhook() to verify connectivity');
}
