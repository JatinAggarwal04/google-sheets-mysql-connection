# Google Sheets ↔ MySQL 2-Way Sync Platform

A production-grade bidirectional data synchronization platform between Google Sheets and MySQL databases. Supports **multi-user authentication**, **real-time change detection**, **conflict resolution**, and **multiplayer editing**.

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![React](https://img.shields.io/badge/React-18-61dafb)
![Supabase](https://img.shields.io/badge/Supabase-Auth-3ecf8e)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🎯 Features

### Core Capabilities
- **Real-time Bidirectional Sync**: Changes in Google Sheets instantly reflect in MySQL and vice versa
- **Automatic Schema Inference**: Detects column types from Sheet data and creates MySQL tables dynamically
- **Conflict Resolution**: Configurable strategies (Last-Write-Wins, Source-Priority, Manual)
- **Loop Prevention**: Smart `_sync_source` tracking prevents infinite sync loops

### Multi-User Platform
- **Supabase Authentication**: Email/Password + Google OAuth login
- **Per-User Connections**: Each user manages their own Sheet↔MySQL connections
- **Encrypted Credentials**: AES-256-GCM encryption for stored secrets

### Multiplayer Support
- **Concurrent Edit Handling**: Supports multiple users editing the same Sheet simultaneously
- **Edit Debouncing**: 50ms batching window to handle rapid typing
- **User Session Tracking**: Identifies which user made each change

### Real-time Dashboard
- **Tabbed Interface**: Status | Google Sheets | MySQL views
- **Live WebSocket Updates**: Real-time sync status and event log
- **Data Tables**: Full CRUD operations for both sources
- **Conflict Viewer**: Monitor and resolve conflicts manually

---

## 🏗️ Architecture

```
┌─────────────────┐         ┌──────────────────────────────────────┐         ┌─────────────────┐
│  Google Sheet   │◄────────│         Sync Platform                │────────►│     MySQL       │
│                 │         │                                      │         │                 │
│  Users edit     │         │  ┌─────────────┐  ┌───────────────┐  │         │  Binary Log     │
│  cells in UI    │────────►│  │   Webhook   │  │   CDC Listener│◄─┼─────────│  (Row-based)    │
│                 │ onEdit  │  │   Receiver  │  │   (mysql-events)│ │         │                 │
│                 │ trigger │  └──────┬──────┘  └───────┬───────┘  │         │                 │
└─────────────────┘         │         │                 │          │         └─────────────────┘
                            │         ▼                 ▼          │
                            │  ┌────────────────────────────────┐  │
                            │  │     Sync Engine (Coordinator)  │  │
                            │  │   - Conflict Resolution        │  │
                            │  │   - Schema Management          │  │
                            │  └───────────────┬────────────────┘  │
                            │                  │                   │
                            │                  ▼                   │
                            │  ┌────────────────────────────────┐  │
                            │  │    WebSocket Server            │──────────► Dashboard UI
                            │  │   (Real-time Updates)          │  │
                            │  └────────────────────────────────┘  │
                            └──────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0+ with binary logging enabled
- Google Cloud project with Sheets API enabled
- Supabase project (for authentication)

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/google-sheets-mysql-connection.git
cd google-sheets-mysql-connection
npm install
cd client && npm install && cd ..
```

### 2. Configure MySQL

Enable binary logging (required for CDC):

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
2. Create project and enable **Google Sheets API** + **Google Drive API**
3. Create a **Service Account** and download JSON key
4. **Share your Google Sheet** with the service account email

### 4. Set Up Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Enable Email/Password and Google OAuth in Authentication settings
3. Copy Project URL and Anon Key

### 5. Configure Environment

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
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_PRIVATE_KEY_PATH=./credentials/service-account.json

# Supabase (Frontend Auth)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Security
ENCRYPTION_KEY=your_32_byte_hex_key
API_KEY=your_secure_api_key
WEBHOOK_SECRET=your_webhook_secret
```

### 6. Set Up Apps Script

1. Open your Google Sheet → **Extensions → Apps Script**
2. Replace default code with `google-apps-script/Code.gs`
3. Update `CONFIG.WEBHOOK_URL` to your server URL
4. Deploy as Web App and set up installable trigger for `onEditInstallable`

### 7. Run

```bash
# Development (both backend + frontend)
npm run dev                    # Backend on :3000
cd client && npm run dev       # Frontend on :5173

# Production
npm run build
npm start
```

Open http://localhost:5173 for the dashboard.

---

## 🧩 Edge Cases & Nuances Handled

| Category | Edge Case | Solution |
|----------|-----------|----------|
| **Concurrency** | Multiple users edit same cell simultaneously | Last-Write-Wins with 50ms debounce batching |
| **Schema** | New column added to Google Sheet | Dynamic `ALTER TABLE` adds column to MySQL |
| **Schema** | Column deleted from Sheet | Preserved in MySQL (no destructive migration) |
| **Data Types** | Mixed types in same column (text/numbers) | Infer from first 100 rows, fallback to VARCHAR |
| **Loop Prevention** | Sync triggers infinite loop | `_sync_source` column tracks origin, CDC filters own writes |
| **Authentication** | Token expiry during long session | Supabase refresh tokens auto-renew |
| **Rate Limits** | Google API 100 requests/minute | Exponential backoff with jitter |
| **Large Data** | Sheet has 10,000+ rows | Chunked processing (100 rows/batch) |
| **Conflicts** | Same row edited in both systems | Configurable: LWW / Sheet-Wins / MySQL-Wins / Manual |
| **Network** | Webhook fails to deliver | Polling fallback every 30 seconds |
| **Deletion** | Row deleted in one system | `_deleted` soft-delete flag (configurable) |
| **Empty Cells** | Sheet cell is empty | Maps to NULL in MySQL |
| **Special Characters** | Column names with spaces/symbols | Sanitized to valid MySQL identifiers |
| **Binary Log** | CDC not capturing changes | Verification check on startup, clear error message |

---

## 📡 API Reference

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Basic health check |
| `/api/health/ready` | GET | Readiness probe |

### Protected Endpoints (Require Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/connections` | GET | List user's connections |
| `/api/connections` | POST | Create new connection |
| `/api/connections/:id` | DELETE | Delete connection |
| `/api/sync/status` | GET | Current sync status |
| `/api/sync/trigger` | POST | Trigger full sync |
| `/api/data/sheets` | GET | Fetch Google Sheets data |
| `/api/data/mysql` | GET | Fetch MySQL data |

---

## 🔒 Security

- **Supabase JWT Authentication**: All API routes protected
- **AES-256-GCM Encryption**: Credentials encrypted at rest
- **HMAC Webhook Verification**: Prevents unauthorized change injection
- **Rate Limiting**: 100 requests/minute per IP
- **SQL Injection Prevention**: Prepared statements only
- **Security Headers**: Helmet.js (CSP, HSTS, etc.)

---

## 📁 Project Structure

```
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── pages/         # DashboardHome, ConnectionDetail, Wizard
│   │   ├── components/    # StatusDashboard, Tabs, SheetsView, MySQLView
│   │   └── contexts/      # AuthContext
├── src/                    # Node.js backend
│   ├── server/            # Express routes + middleware
│   ├── sync/              # SyncEngine, Coordinator
│   ├── sheets/            # Google Sheets API client
│   ├── mysql/             # MySQL client, CDC, Schema Manager
│   └── utils/             # Logger, Crypto, Errors
├── public/                 # Legacy static dashboard (reference)
└── google-apps-script/     # Apps Script webhook code
```

---

## 🎥 Demo

[Video Demo Link - Coming Soon]

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
