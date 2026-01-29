# Google Sheets ↔ MySQL Sync Platform

A production-grade, multi-tenant SaaS platform for bidirectional synchronization between Google Sheets and MySQL databases.

![Platform Overview](https://via.placeholder.com/800x400?text=Google+Sheets+%E2%86%94+MySQL+Sync)

## ✨ Features

- **Bidirectional Sync** - Real-time synchronization in both directions
- **Multi-Tenant Architecture** - Each user has isolated data and connections
- **OAuth-Based Google Access** - Secure access to user's Google Sheets
- **Queue-Based Processing** - BullMQ for reliable job processing
- **Conflict Resolution** - Intelligent handling of simultaneous changes
- **AES-256 Encryption** - All credentials encrypted at rest
- **Production Ready** - Comprehensive error handling and logging

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React/Vite    │────▶│  Express API    │────▶│    Supabase     │
│    Frontend     │     │    Backend      │     │   (Auth + DB)   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  Redis   │ │  Google  │ │   MySQL  │
              │ (BullMQ) │ │   APIs   │ │ Database │
              └──────────┘ └──────────┘ └──────────┘
```

## 📁 Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── stores/         # Zustand state management
│   │   ├── lib/            # API client, utilities
│   │   └── App.tsx         # Main app with routing
│   └── package.json
│
├── server/                 # Express backend
│   ├── src/
│   │   ├── config/         # Environment, Redis, Supabase
│   │   ├── lib/            # Logger, encryption, errors
│   │   ├── types/          # TypeScript types
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, error handling
│   │   ├── routes/         # API routes
│   │   └── index.ts        # Server entry point
│   └── package.json
│
├── supabase/
│   └── schema.sql          # Database schema
│
├── package.json            # Root workspace config
└── .env.example            # Environment template
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Redis (for BullMQ)
- Supabase account
- Google Cloud Console project with OAuth credentials
- MySQL database (for testing)

### 1. Clone and Install

```bash
git clone <repository>
cd google-sheets-mysql-sync

# Install all dependencies
npm install
```

### 2. Configure Environment

```bash
# Copy environment templates
cp .env.example .env
cp client/.env.example client/.env

# Edit .env and client/.env with your values
```

### 3. Set Up Supabase

1. Create a new Supabase project
2. Run the schema in `supabase/schema.sql` in the SQL Editor
3. Copy your project URL and keys to `.env`

### 4. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Sheets API and Google Drive API
4. Configure OAuth consent screen
5. Create OAuth 2.0 credentials
6. Add redirect URI: `http://localhost:3001/api/auth/google/callback`
7. Copy client ID and secret to `.env`

### 5. Start Development

```bash
# Start both client and server
npm run dev

# Or start individually:
cd server && npm run dev
cd client && npm run dev
```

### 6. Open the Application

**Important:** Due to OAuth/Cloudflare requirements, manually open:

```
http://localhost:5173
```

## 📋 Environment Variables

### Server (.env)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `REDIS_URL` | Redis connection URL |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256 |
| `CLIENT_URL` | Frontend URL for CORS |

### Client (client/.env)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

## 🔐 Security

- **Authentication**: Supabase Auth with JWT
- **Authorization**: Row Level Security (RLS) policies
- **Encryption**: AES-256-GCM for credentials with PBKDF2 key derivation
- **CORS**: Whitelist-based origin validation
- **Helmet**: HTTP security headers

## 🔄 Sync Flow

1. User creates an integration via the wizard
2. System enqueues initial sync job to BullMQ
3. Worker picks up job and processes sync:
   - Read data from source (Sheets or MySQL)
   - Compare with destination using hash-based diffing
   - Apply changes (insert/update/delete)
   - Log sync results
4. Updates `last_sync_at` on integration

## 📡 API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/me` - Get current user

### Google Connections
- `GET /api/google/connections` - List connections
- `DELETE /api/google/connections/:id` - Delete connection
- `GET /api/google/spreadsheets` - List spreadsheets
- `GET /api/google/spreadsheets/:id` - Get spreadsheet info

### MySQL Connections
- `GET /api/mysql/connections` - List connections
- `POST /api/mysql/connections` - Create connection
- `POST /api/mysql/connections/test` - Test connection
- `DELETE /api/mysql/connections/:id` - Delete connection
- `GET /api/mysql/connections/:id/tables` - List tables

### Integrations
- `GET /api/integrations` - List integrations
- `POST /api/integrations` - Create integration
- `GET /api/integrations/:id` - Get integration details
- `DELETE /api/integrations/:id` - Delete integration
- `POST /api/integrations/:id/pause` - Pause sync
- `POST /api/integrations/:id/resume` - Resume sync
- `GET /api/integrations/:id/logs` - Get sync logs

### Health
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed service status

## 🧪 Development

```bash
# Run server in development
cd server && npm run dev

# Run client in development
cd client && npm run dev

# Build for production
npm run build

# Run tests
cd server && npm test
```

## 📝 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request
