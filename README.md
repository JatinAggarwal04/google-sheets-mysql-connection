# Google Sheets ↔ MySQL 2-Way Sync Platform

A production-grade bidirectional data synchronization platform between Google Sheets and MySQL databases with real-time change detection, conflict resolution, and multiplayer support.

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

### Core Capabilities
- **Real-time Bidirectional Sync**: Changes in Google Sheets are instantly reflected in MySQL and vice versa
- **Automatic Schema Inference**: Automatically detects column types from Sheet data and creates corresponding MySQL tables
- **Conflict Resolution**: Configurable strategies (Last-Write-Wins, Source-Priority, Manual)
- **Loop Prevention**: Smart origin tracking prevents infinite sync loops

### Multiplayer Support
- **Concurrent Edit Handling**: Supports multiple users editing the same Sheet simultaneously
- **Edit Debouncing**: 50ms batching window to handle rapid typing
- **User Session Tracking**: Identifies which user made each change

### Production-Ready
- **Structured Logging**: Winston-based JSON logging for production (no console.logs)
- **Rate Limiting**: Protects API endpoints from abuse
- **HMAC Authentication**: Secure webhook verification
- **Health Checks**: Ready/liveness endpoints for container orchestration
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT

### Real-time Dashboard
- **Live Status Display**: WebSocket-powered sync status updates
- **Event Log**: Real-time feed of all sync events
- **Conflict Viewer**: Monitor and resolve conflicts manually
- **System Metrics**: Queue depth, connection status, health indicators

### Data Viewer/Editor
- **Tabbed Interface**: Switch between Status, Google Sheets, and MySQL views
- **Data Tables**: View all data from both sources in responsive tables
- **Inline Editing**: Edit any row directly from the dashboard
- **Add/Delete Rows**: Create and delete entries in either source
- **Auto-Refresh**: Data updates automatically after sync events

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────────────┐         ┌─────────────────┐
│  Google Sheet   │◄────────│         Sync Platform                │────────►│     MySQL       │
│                 │         │                                      │         │                 │
│  Users edit     │         │  ┌─────────────┐  ┌───────────────┐  │         │  Binary Log     │
│  cells in UI    │────────►│  │   Webhook   │  │   CDC Listener│◄─┼─────────│  Captures all   │
│                 │ onEdit  │  │   Receiver  │  │   (mysql-events)│ │         │  changes        │
│                 │ trigger │  └──────┬──────┘  └───────┬───────┘  │         │                 │
└─────────────────┘         │         │                 │          │         └─────────────────┘
                            │         ▼                 ▼          │
                            │  ┌────────────────────────────────┐  │
                            │  │        Change Queue            │  │
                            │  │   (Deduplication + Priority)   │  │
                            │  └───────────────┬────────────────┘  │
                            │                  │                   │
                            │                  ▼                   │
                            │  ┌────────────────────────────────┐  │
                            │  │      Conflict Resolver         │  │
                            │  │  (LWW / Source Priority / Manual)│ │
                            │  └───────────────┬────────────────┘  │
                            │                  │                   │
                            │                  ▼                   │
                            │  ┌────────────────────────────────┐  │
                            │  │        Sync Engine             │  │
                            │  │   (Bidirectional Coordinator)  │  │
                            │  └────────────────────────────────┘  │
                            │                  │                   │
                            │                  ▼                   │
                            │  ┌────────────────────────────────┐  │
                            │  │    WebSocket Server            │──────────► Dashboard UI
                            │  │   (Real-time Updates)          │  │
                            │  └────────────────────────────────┘  │
                            └──────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0+ with binary logging enabled
- Google Cloud project with Sheets API enabled

### 1. Clone and Install

```bash
cd google-sheets-mysql-connection
npm install
```

### 2. Configure MySQL

Enable binary logging in MySQL (required for CDC):

```sql
-- Check if binary logging is enabled
SHOW VARIABLES LIKE 'log_bin';

-- If not enabled, add to my.cnf:
-- [mysqld]
-- log-bin=mysql-bin
-- binlog_format=ROW
-- server-id=1

-- Create database
CREATE DATABASE sheets_sync;

-- Grant required permissions
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'your_user'@'localhost';
GRANT ALL PRIVILEGES ON sheets_sync.* TO 'your_user'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Set Up Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Sheets API** and **Google Drive API**
4. Create a **Service Account**:
   - Go to "IAM & Admin" → "Service Accounts"
   - Create service account
   - Download JSON key file
5. **Share your Google Sheet** with the service account email

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Key settings:
```env
# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=sheets_sync

# Google Sheets
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_from_url
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_PRIVATE_KEY_PATH=./credentials/service-account.json

# Security
API_KEY=your_secure_api_key_min_16_chars
WEBHOOK_SECRET=your_webhook_secret_min_16_chars
```

### 5. Set Up Apps Script

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Replace default code with contents of `google-apps-script/Code.gs`
4. Update `CONFIG.WEBHOOK_URL` to your server URL
5. Update `CONFIG.WEBHOOK_SECRET` to match your `.env`
6. Deploy as Web App
7. Set up installable trigger:
   - Click clock icon (Triggers)
   - Add Trigger → `onEditInstallable` → On edit

### 6. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Open http://localhost:3000 for the dashboard.

## API Reference

### Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | - | Basic health check |
| `/api/health/detailed` | GET | - | Component-level health |
| `/api/health/ready` | GET | - | Readiness probe |
| `/api/health/live` | GET | - | Liveness probe |
| `/api/sync/status` | GET | - | Current sync status |
| `/api/sync/trigger` | POST | API Key | Trigger full sync |
| `/api/sync/conflicts` | GET | - | List pending conflicts |
| `/api/sync/conflicts/:id/resolve` | POST | API Key | Resolve conflict |
| `/api/sync/queue` | GET | - | Queue statistics |
| `/api/webhook/sheets` | POST | HMAC | Receive Sheet changes |
| `/api/webhook/test` | POST | - | Test webhook (dev only) |
| `/api/data/info` | GET | - | Get connection info for both sources |
| `/api/data/sheets` | GET | - | Fetch all Google Sheets data |
| `/api/data/mysql` | GET | - | Fetch all MySQL data |
| `/api/data/sheets/:row` | PUT | - | Update a row in Google Sheets |
| `/api/data/mysql/:id` | PUT | - | Update a row in MySQL |
| `/api/data/sheets` | POST | - | Add a new row to Google Sheets |
| `/api/data/mysql` | POST | - | Add a new row to MySQL |
| `/api/data/sheets/:row` | DELETE | - | Delete a row from Google Sheets |
| `/api/data/mysql/:id` | DELETE | - | Delete a row from MySQL |

### Authentication

**API Key** (for protected endpoints):
```
X-API-Key: your_api_key
```

**Webhook HMAC** (from Apps Script):
```
X-Webhook-Signature: base64_hmac_sha256
X-Timestamp: unix_timestamp_ms
```

## Configuration Options

### Conflict Resolution Strategies

```env
# Last-Write-Wins (default) - Most recent change wins
CONFLICT_STRATEGY=last-write-wins

# Sheet Priority - Sheet changes always win
CONFLICT_STRATEGY=sheet-wins

# MySQL Priority - Database changes always win
CONFLICT_STRATEGY=mysql-wins

# Manual - Queue conflicts for manual resolution
CONFLICT_STRATEGY=manual
```

### Sync Settings

```env
# Target table name in MySQL
SYNC_TABLE_NAME=synced_data

# Debounce window for rapid edits (ms)
SYNC_DEBOUNCE_MS=50

# Batch size for processing queue
SYNC_BATCH_SIZE=100
```

## Scaling Considerations

| Concern | Solution |
|---------|----------|
| High edit volume | 50ms debounce batching, priority queue |
| Large datasets | Chunked processing, connection pooling |
| Multiple sheets | Deploy multiple instances (stateless) |
| Many dashboard clients | WebSocket broadcasting (not per-client) |
| Reliability | Graceful shutdown, reconnection logic |

## Security

- **No secrets in code**: All sensitive data via environment variables
- **HMAC webhook auth**: Prevents unauthorized change injection
- **API key protection**: Protected endpoints require valid key
- **SQL injection prevention**: Prepared statements only
- **Rate limiting**: 100 requests/minute default
- **Security headers**: Helmet.js CSP, HSTS, etc.
- **Input validation**: Zod schemas for all inputs

## Troubleshooting

### Apps Script not triggering
1. Check trigger is installed (clock icon → see triggers)
2. Run `testWebhook()` manually to test connectivity
3. Check Apps Script execution logs

### CDC not capturing changes
1. Verify MySQL binary logging: `SHOW VARIABLES LIKE 'log_bin'`
2. Check binlog format: `SHOW VARIABLES LIKE 'binlog_format'` (must be ROW)
3. Verify user has REPLICATION permissions

### WebSocket disconnecting
1. Check for proxy/load balancer timeout settings
2. Increase `HEARTBEAT_INTERVAL` if needed
3. Check browser console for errors

### Sync loops
The platform tracks `_sync_source` to prevent loops. If you see loops:
1. Check `SYNC_SOURCE` is being set correctly
2. Verify CDC is filtering by `_sync_source`

## Development

```bash
# Run with auto-reload
npm run dev

# Type checking
npm run typecheck

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) for details.
