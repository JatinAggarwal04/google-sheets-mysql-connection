/**
 * Google Sheets ↔ MySQL Sync Dashboard
 * Client-side JavaScript
 */

class SyncDashboard {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnected = false;
    
    this.elements = {
      connectionStatus: document.getElementById('connectionStatus'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      syncStatus: document.getElementById('syncStatus'),
      pendingChanges: document.getElementById('pendingChanges'),
      conflictCount: document.getElementById('conflictCount'),
      lastSync: document.getElementById('lastSync'),
      eventLog: document.getElementById('eventLog'),
      triggerSyncBtn: document.getElementById('triggerSyncBtn'),
      refreshStatusBtn: document.getElementById('refreshStatusBtn'),
      clearLogBtn: document.getElementById('clearLogBtn'),
    };

    this.init();
  }

  init() {
    this.connectWebSocket();
    this.bindEvents();
    this.fetchInitialStatus();
  }

  /**
   * Connect to WebSocket server
   */
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.updateConnectionStatus('connecting');
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateConnectionStatus('connected');
        this.addLogEntry('info', 'WebSocket connected');
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.updateConnectionStatus('disconnected');
        this.addLogEntry('error', 'WebSocket disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.addLogEntry('error', 'WebSocket error occurred');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule WebSocket reconnection
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.addLogEntry('error', 'Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.addLogEntry('info', `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

    setTimeout(() => this.connectWebSocket(), delay);
  }

  /**
   * Update connection status UI
   */
  updateConnectionStatus(status) {
    const dot = this.elements.statusDot;
    const text = this.elements.statusText;

    dot.classList.remove('connected', 'disconnected', 'connecting');
    dot.classList.add(status);

    switch (status) {
      case 'connected':
        text.textContent = 'Connected';
        break;
      case 'disconnected':
        text.textContent = 'Disconnected';
        break;
      case 'connecting':
        text.textContent = 'Connecting...';
        break;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(message) {
    const { type, data, timestamp } = message;

    switch (type) {
      case 'connected':
        // Initial connection acknowledged
        break;

      case 'status:update':
        this.updateStatus(data);
        break;

      case 'sync:start':
        this.updateSyncStatus('Syncing...', true);
        this.addLogEntry('sync', 'Full sync started');
        break;

      case 'sync:complete':
        this.updateSyncStatus('Idle', false);
        this.updateLastSync();
        this.addLogEntry('sync', `Sync completed: ${data.processed} rows in ${data.duration}ms`);
        break;

      case 'sync:error':
        this.updateSyncStatus('Error', false);
        this.addLogEntry('error', `Sync error: ${data.message}`);
        break;

      case 'change:processed':
        this.addLogEntry('change', `${data.operation} on row <code>${data.rowId}</code> from ${data.origin}`);
        break;

      case 'conflict:detected':
        this.addLogEntry('conflict', `Conflict detected on row <code>${data.sheetRowId}</code>`);
        break;

      case 'conflict:resolved':
        this.addLogEntry('info', `Conflict resolved: ${data.winner} wins`);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }

  /**
   * Bind UI event handlers
   */
  bindEvents() {
    this.elements.triggerSyncBtn.addEventListener('click', () => this.triggerSync());
    this.elements.refreshStatusBtn.addEventListener('click', () => this.fetchInitialStatus());
    this.elements.clearLogBtn.addEventListener('click', () => this.clearLog());
  }

  /**
   * Fetch initial status from API
   */
  async fetchInitialStatus() {
    try {
      const response = await fetch('/api/sync/status');
      const data = await response.json();
      this.updateStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      this.addLogEntry('error', 'Failed to fetch status');
    }
  }

  /**
   * Update status cards
   */
  updateStatus(data) {
    if (data.isRunning !== undefined) {
      const status = data.currentOperation || (data.isRunning ? 'Running' : 'Idle');
      this.updateSyncStatus(status, data.currentOperation === 'Syncing');
    }

    if (data.pendingChanges !== undefined) {
      this.elements.pendingChanges.textContent = data.pendingChanges;
    }

    if (data.unresolvedConflicts !== undefined) {
      this.elements.conflictCount.textContent = data.unresolvedConflicts;
    }

    if (data.lastSyncAt) {
      this.updateLastSync(new Date(data.lastSyncAt));
    }
  }

  /**
   * Update sync status display
   */
  updateSyncStatus(status, isSyncing = false) {
    this.elements.syncStatus.textContent = status;
    this.elements.syncStatus.classList.toggle('syncing', isSyncing);
    this.elements.triggerSyncBtn.disabled = isSyncing;
  }

  /**
   * Update last sync time
   */
  updateLastSync(date = new Date()) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    let timeStr;
    if (diff < 60) {
      timeStr = 'Just now';
    } else if (diff < 3600) {
      timeStr = `${Math.floor(diff / 60)}m ago`;
    } else {
      timeStr = date.toLocaleTimeString();
    }

    this.elements.lastSync.textContent = timeStr;
  }

  /**
   * Trigger full sync via API
   */
  async triggerSync() {
    const apiKey = prompt('Enter API key to trigger sync:');
    if (!apiKey) return;

    try {
      this.elements.triggerSyncBtn.disabled = true;
      
      const response = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });

      const data = await response.json();

      if (response.ok) {
        this.addLogEntry('sync', 'Full sync triggered');
      } else {
        this.addLogEntry('error', data.error?.message || 'Failed to trigger sync');
        this.elements.triggerSyncBtn.disabled = false;
      }
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      this.addLogEntry('error', 'Failed to trigger sync');
      this.elements.triggerSyncBtn.disabled = false;
    }
  }

  /**
   * Add entry to event log
   */
  addLogEntry(type, message) {
    // Remove empty placeholder if present
    const emptyPlaceholder = this.elements.eventLog.querySelector('.log-empty');
    if (emptyPlaceholder) {
      emptyPlaceholder.remove();
    }

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">${new Date().toLocaleTimeString()}</span>
      <span class="log-type ${type}">${this.getTypeLabel(type)}</span>
      <span class="log-message">${message}</span>
    `;

    // Add to top of log
    this.elements.eventLog.insertBefore(entry, this.elements.eventLog.firstChild);

    // Limit log entries
    const entries = this.elements.eventLog.querySelectorAll('.log-entry');
    if (entries.length > 100) {
      entries[entries.length - 1].remove();
    }
  }

  /**
   * Get display label for log type
   */
  getTypeLabel(type) {
    const labels = {
      sync: 'SYNC',
      change: 'CHANGE',
      conflict: 'CONFLICT',
      error: 'ERROR',
      info: 'INFO',
    };
    return labels[type] || type.toUpperCase();
  }

  /**
   * Clear event log
   */
  clearLog() {
    this.elements.eventLog.innerHTML = `
      <div class="log-empty">
        <p>Waiting for events...</p>
      </div>
    `;
  }
}

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new SyncDashboard();
});
