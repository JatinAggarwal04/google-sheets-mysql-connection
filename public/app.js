/**
 * Google Sheets ↔ MySQL Sync Dashboard
 * Client-side JavaScript with Data Viewer/Editor
 */

class SyncDashboard {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnected = false;
    this.currentTab = 'status';
    this.sheetsData = null;
    this.mysqlData = null;
    this.editingSource = null;
    this.editingId = null;
    this.dataInfo = null;
    
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
      // Data elements
      sheetsTableContainer: document.getElementById('sheetsTableContainer'),
      mysqlTableContainer: document.getElementById('mysqlTableContainer'),
      refreshSheetsBtn: document.getElementById('refreshSheetsBtn'),
      refreshMysqlBtn: document.getElementById('refreshMysqlBtn'),
      addSheetRowBtn: document.getElementById('addSheetRowBtn'),
      addMysqlRowBtn: document.getElementById('addMysqlRowBtn'),
      openSheetLink: document.getElementById('openSheetLink'),
      // Modal
      editModal: document.getElementById('editModal'),
      modalTitle: document.getElementById('modalTitle'),
      editForm: document.getElementById('editForm'),
      editFields: document.getElementById('editFields'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      cancelEditBtn: document.getElementById('cancelEditBtn'),
      // Prompt Modal
      promptModal: document.getElementById('promptModal'),
      promptForm: document.getElementById('promptForm'),
      promptInput: document.getElementById('promptInput'),
      closePromptBtn: document.getElementById('closePromptBtn'),
      cancelPromptBtn: document.getElementById('cancelPromptBtn'),
      // Confirm Modal
      confirmModal: document.getElementById('confirmModal'),
      confirmMessage: document.getElementById('confirmMessage'),
      doConfirmBtn: document.getElementById('doConfirmBtn'),
      closeConfirmBtn: document.getElementById('closeConfirmBtn'),
      cancelConfirmBtn: document.getElementById('cancelConfirmBtn'),
    };

    this.init();
  }

  init() {
    this.connectWebSocket();
    this.bindEvents();
    this.fetchInitialStatus();
    this.fetchDataInfo();
  }

  // ========== TAB MANAGEMENT ==========
  
  bindTabEvents() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    
    // Load data when switching to data tabs
    if (tabName === 'sheets' && !this.sheetsData) {
      this.fetchSheetsData();
    } else if (tabName === 'mysql' && !this.mysqlData) {
      this.fetchMysqlData();
    }
  }

  // ========== DATA FETCHING ==========

  async fetchDataInfo() {
    try {
      const response = await fetch('/api/data/info');
      this.dataInfo = await response.json();
      
      // Update Google Sheets link
      if (this.dataInfo.sheets.url) {
        this.elements.openSheetLink.href = this.dataInfo.sheets.url;
      }
    } catch (error) {
      console.error('Failed to fetch data info:', error);
    }
  }

  async fetchSheetsData() {
    this.elements.sheetsTableContainer.innerHTML = '<div class="loading">Loading data...</div>';
    
    try {
      const response = await fetch('/api/data/sheets');
      const data = await response.json();
      
      if (response.ok) {
        this.sheetsData = data;
        this.renderSheetsTable();
      } else {
        this.elements.sheetsTableContainer.innerHTML = 
          `<div class="table-empty">Error: ${data.error?.message || 'Failed to load data'}</div>`;
      }
    } catch (error) {
      console.error('Failed to fetch Sheets data:', error);
      this.elements.sheetsTableContainer.innerHTML = 
        '<div class="table-empty">Failed to load data. Check console for details.</div>';
    }
  }

  async fetchMysqlData() {
    this.elements.mysqlTableContainer.innerHTML = '<div class="loading">Loading data...</div>';
    
    try {
      const response = await fetch('/api/data/mysql');
      const data = await response.json();
      
      if (response.ok) {
        this.mysqlData = data;
        this.renderMysqlTable();
      } else {
        this.elements.mysqlTableContainer.innerHTML = 
          `<div class="table-empty">Error: ${data.error?.message || 'Failed to load data'}</div>`;
      }
    } catch (error) {
      console.error('Failed to fetch MySQL data:', error);
      this.elements.mysqlTableContainer.innerHTML = 
        '<div class="table-empty">Failed to load data. Check console for details.</div>';
    }
  }

  // ========== TABLE RENDERING ==========

  renderSheetsTable() {
    if (!this.sheetsData || this.sheetsData.rows.length === 0) {
      this.elements.sheetsTableContainer.innerHTML = '<div class="table-empty">No data found in the Google Sheet.</div>';
      return;
    }

    const displayHeaders = this.sheetsData.headers.filter(h => !h.startsWith('_'));
    
    let html = `
      <table class="data-table">
        <thead>
          <tr>
            ${displayHeaders.map(h => `<th>${h === '_rowNumber' ? 'Row' : this.escapeHtml(h)}</th>`).join('')}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const row of this.sheetsData.rows) {
      const rowNum = row._rowNumber;
      html += `<tr data-row="${rowNum}">`;
      
      for (const header of displayHeaders) {
        const value = row[header];
        const displayValue = value != null ? this.escapeHtml(String(value)) : '';
        const cellClass = header === '_rowNumber' ? 'muted' : '';
        html += `<td class="${cellClass}">${displayValue}</td>`;
      }
      
      html += `
        <td>
          <div class="row-actions">
            <button class="btn-icon edit-btn" data-source="sheets" data-id="${rowNum}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon btn-danger delete-btn" data-source="sheets" data-id="${rowNum}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      `;
      html += '</tr>';
    }
    
    html += '</tbody></table>';
    this.elements.sheetsTableContainer.innerHTML = html;
    this.bindTableActions('sheets');
  }

  renderMysqlTable() {
    if (!this.mysqlData || this.mysqlData.rows.length === 0) {
      this.elements.mysqlTableContainer.innerHTML = '<div class="table-empty">No data found in MySQL table.</div>';
      return;
    }

    // Filter out internal columns for display
    const displayHeaders = this.mysqlData.headers.filter(h => !h.startsWith('_') || h === 'id');
    
    let html = `
      <table class="data-table">
        <thead>
          <tr>
            ${displayHeaders.map(h => `<th>${this.escapeHtml(h)}</th>`).join('')}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const row of this.mysqlData.rows) {
      html += `<tr data-id="${row.id}">`;
      
      for (const header of displayHeaders) {
        const value = row[header];
        let displayValue = '';
        
        if (value instanceof Date) {
          displayValue = value.toLocaleString();
        } else if (value != null) {
          displayValue = this.escapeHtml(String(value));
        }
        
        const cellClass = header === 'id' ? 'muted' : '';
        html += `<td class="${cellClass}">${displayValue}</td>`;
      }
      
      html += `
        <td>
          <div class="row-actions">
            <button class="btn-icon edit-btn" data-source="mysql" data-id="${row.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon btn-danger delete-btn" data-source="mysql" data-id="${row.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      `;
      html += '</tr>';
    }
    
    html += '</tbody></table>';
    this.elements.mysqlTableContainer.innerHTML = html;
    this.bindTableActions('mysql');
  }

  bindTableActions(source) {
    const container = source === 'sheets' 
      ? this.elements.sheetsTableContainer 
      : this.elements.mysqlTableContainer;
    
    // Edit buttons
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.openEditModal(source, id);
      });
    });
    
    // Delete buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.deleteRow(source, id);
      });
    });
  }

  // ========== MODAL MANAGEMENT ==========

  openEditModal(source, id, isNew = false) {
    this.editingSource = source;
    this.editingId = id;
    
    // Get the row data
    let rowData = {};
    let headers = [];
    
    // Fields to exclude from the "Add New" form (auto-filled by backend)
    const autoFields = ['status', 'created_at', 'id', '_rowNumber', '_created_at', '_updated_at', '_sync_timestamp', '_sync_source'];

    
    if (source === 'sheets') {
      if (isNew) {
        headers = this.sheetsData?.headers.filter(h => !autoFields.includes(h)) || [];
      } else {
        const row = this.sheetsData?.rows.find(r => r._rowNumber == id);
        if (row) {
          rowData = { ...row };
          delete rowData._rowNumber;
          headers = Object.keys(rowData);
        }
      }
    } else {
      if (isNew) {
        headers = this.mysqlData?.headers.filter(h => !h.startsWith('_') && !autoFields.includes(h)) || [];
      } else {
        const row = this.mysqlData?.rows.find(r => r.id == id);
        if (row) {
          rowData = { ...row };
          headers = this.mysqlData.headers.filter(h => !h.startsWith('_') && h !== 'id');
        }
      }
    }
    
    // Set modal title
    this.elements.modalTitle.textContent = isNew 
      ? `Add New Row (${source === 'sheets' ? 'Google Sheets' : 'MySQL'})`
      : `Edit Row ${id} (${source === 'sheets' ? 'Google Sheets' : 'MySQL'})`;
    
    // Build form fields
    let fieldsHtml = '';
    for (const header of headers) {
      const value = rowData[header] ?? '';
      fieldsHtml += `
        <div class="form-group">
          <label for="field-${header}">${this.escapeHtml(header)}</label>
          <input type="text" id="field-${header}" name="${header}" class="form-control" value="${this.escapeHtml(String(value))}">
        </div>
      `;
    }
    
    this.elements.editFields.innerHTML = fieldsHtml;
    
    // Show modal
    this.elements.editModal.classList.add('active');
  }

  closeModal() {
    this.elements.editModal.classList.remove('active');
    this.editingSource = null;
    this.editingId = null;
  }

  async saveEdit() {
    const formData = new FormData(this.elements.editForm);
    const data = Object.fromEntries(formData.entries());
    
    const isNew = this.editingId === 'new';
    const source = this.editingSource;
    
    try {
      let url, method;
      
      if (isNew) {
        url = `/api/data/${source}`;
        method = 'POST';
      } else {
        url = `/api/data/${source}/${this.editingId}`;
        method = 'PUT';
      }
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        this.showToast('success', result.message || 'Saved successfully');
        this.closeModal();
        
        // Refresh data
        if (source === 'sheets') {
          this.fetchSheetsData();
        } else {
          this.fetchMysqlData();
        }
      } else {
        this.showToast('error', result.error?.message || 'Failed to save');
      }
    } catch (error) {
      console.error('Save error:', error);
      this.showToast('error', 'Failed to save. Check console for details.');
    }
  }

  async deleteRow(source, id) {
    this.showConfirmModal('Are you sure you want to delete this row? This action cannot be undone.', async (confirmed) => {
      if (!confirmed) return;
      
      try {
        const response = await fetch(`/api/data/${source}/${id}`, {
          method: 'DELETE',
        });
        
        const result = await response.json();
        
        if (response.ok) {
          this.showToast('success', result.message || 'Deleted successfully');
          
          // Refresh data
          if (source === 'sheets') {
            this.fetchSheetsData();
          } else {
            this.fetchMysqlData();
          }
        } else {
          this.showToast('error', result.error?.message || 'Failed to delete');
        }
      } catch (error) {
        console.error('Delete error:', error);
        this.showToast('error', 'Failed to delete. Check console for details.');
      }
    });
  }

  // ========== TOAST NOTIFICATIONS ==========

  showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // ========== UTILITIES ==========

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== WEBSOCKET ==========

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

  handleMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'connected':
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
        // Refresh data after sync
        if (this.sheetsData) this.fetchSheetsData();
        if (this.mysqlData) this.fetchMysqlData();
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
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }

  bindEvents() {
    // Tab switching
    this.bindTabEvents();
    
    // Status tab buttons
    this.elements.triggerSyncBtn.addEventListener('click', () => this.triggerSync());
    this.elements.refreshStatusBtn.addEventListener('click', () => this.fetchInitialStatus());
    this.elements.clearLogBtn.addEventListener('click', () => this.clearLog());
    
    // Data tab buttons
    this.elements.refreshSheetsBtn.addEventListener('click', () => this.fetchSheetsData());
    this.elements.refreshMysqlBtn.addEventListener('click', () => this.fetchMysqlData());
    
    this.elements.addSheetRowBtn.addEventListener('click', () => {
      if (!this.sheetsData) {
        this.fetchSheetsData().then(() => {
          this.openEditModal('sheets', 'new', true);
        });
      } else {
        this.openEditModal('sheets', 'new', true);
      }
    });
    
    this.elements.addMysqlRowBtn.addEventListener('click', () => {
      if (!this.mysqlData) {
        this.fetchMysqlData().then(() => {
          this.openEditModal('mysql', 'new', true);
        });
      } else {
        this.openEditModal('mysql', 'new', true);
      }
    });
    
    // Modal buttons
    this.elements.closeModalBtn.addEventListener('click', () => this.closeModal());
    this.elements.cancelEditBtn.addEventListener('click', () => this.closeModal());
    this.elements.editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveEdit();
    });
    
    // Close modal on backdrop click
    this.elements.editModal.addEventListener('click', (e) => {
      if (e.target === this.elements.editModal) {
        this.closeModal();
      }
    });

    // Prompt Modal Events
    this.elements.closePromptBtn.addEventListener('click', () => this.closePromptModal());
    this.elements.cancelPromptBtn.addEventListener('click', () => this.closePromptModal());
    this.elements.promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.promptCallback) {
        this.promptCallback(this.elements.promptInput.value);
      }
      this.closePromptModal();
    });

    // Confirm Modal Events
    this.elements.closeConfirmBtn.addEventListener('click', () => this.closeConfirmModal());
    this.elements.cancelConfirmBtn.addEventListener('click', () => this.closeConfirmModal());
    this.elements.doConfirmBtn.addEventListener('click', () => {
      if (this.confirmCallback) {
        this.confirmCallback(true);
      }
      this.closeConfirmModal();
    });
  }

  // ========== CUSTOM MODALS ==========

  showPromptModal(title, label, callback) {
    document.getElementById('promptTitle').textContent = title;
    document.getElementById('promptLabel').textContent = label;
    this.elements.promptInput.value = '';
    this.promptCallback = callback;
    this.elements.promptModal.classList.add('active');
    setTimeout(() => this.elements.promptInput.focus(), 100);
  }

  closePromptModal() {
    this.elements.promptModal.classList.remove('active');
    this.promptCallback = null;
  }

  showConfirmModal(message, callback) {
    this.elements.confirmMessage.textContent = message;
    this.confirmCallback = callback;
    this.elements.confirmModal.classList.add('active');
  }

  closeConfirmModal() {
    this.elements.confirmModal.classList.remove('active');
    this.confirmCallback = null;
  }


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

  updateSyncStatus(status, isSyncing = false) {
    this.elements.syncStatus.textContent = status;
    this.elements.syncStatus.classList.toggle('syncing', isSyncing);
    this.elements.triggerSyncBtn.disabled = isSyncing;
  }

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

  async triggerSync() {
    this.showPromptModal('Trigger Sync', 'Enter API Key to trigger sync:', async (apiKey) => {
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
          this.fetchInitialStatus();
        } else {
          this.addLogEntry('error', data.error?.message || 'Failed to trigger sync');
        }
      } catch (error) {
        console.error('Failed to trigger sync:', error);
        this.addLogEntry('error', 'Failed to trigger sync');
      } finally {
        this.elements.triggerSyncBtn.disabled = false;
      }
    });
  }

  addLogEntry(type, message) {
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

    this.elements.eventLog.insertBefore(entry, this.elements.eventLog.firstChild);

    const entries = this.elements.eventLog.querySelectorAll('.log-entry');
    if (entries.length > 100) {
      entries[entries.length - 1].remove();
    }
  }

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
