-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Integrations (User-facing connections)
create table integrations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  status text check (status in ('active', 'paused', 'error')) default 'active',
  source_config jsonb not null default '{}'::jsonb, -- e.g. { "sheetId": "...", "sheetName": "..." }
  dest_config jsonb not null default '{}'::jsonb,   -- e.g. { "table": "...", "host": "..." }
  sync_mode text check (sync_mode in ('2-way', 'sheet-to-db', 'db-to-sheet')) default '2-way',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: Integrations
alter table integrations enable row level security;
create policy "Users can view own integrations" on integrations for select using (auth.uid() = user_id);
create policy "Users can insert own integrations" on integrations for insert with check (auth.uid() = user_id);
create policy "Users can update own integrations" on integrations for update using (auth.uid() = user_id);
create policy "Users can delete own integrations" on integrations for delete using (auth.uid() = user_id);

-- 2. User Credentials (Encrypted Secrets)
-- Only accessed by the Backend Service Role (bypassing RLS)
create table user_credentials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  provider text not null, -- 'google', 'mysql'
  encrypted_data text not null, -- Encrypted JSON string (access_token, refresh_token, etc.)
  iv text not null, -- Initialization Vector for AES
  auth_tag text not null, -- Authentication Tag for GCM
  key_fingerprint text, -- To validate which key version encrypted this
  metadata jsonb default '{}'::jsonb, -- Safe metadata (e.g. email, db host)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: User Credentials
-- STRICT: Users cannot read this directly from frontend. Only Service Role can.
alter table user_credentials enable row level security;
create policy "No access for anon/authenticated" on user_credentials for all using (false);

-- 3. Sync State (Internal processing state)
create table sync_state (
  integration_id uuid references integrations(id) on delete cascade primary key,
  last_sync_at timestamptz,
  status text, -- 'idle', 'syncing', 'failed'
  error_message text,
  sheet_watermark text, -- For polling optimization
  mysql_watermark text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: Sync State
alter table sync_state enable row level security;
create policy "Users can view own sync state" on sync_state for select using (
  exists (select 1 from integrations where integrations.id = sync_state.integration_id and integrations.user_id = auth.uid())
);

-- 4. Sync Logs (History)
create table sync_logs (
  id uuid primary key default uuid_generate_v4(),
  integration_id uuid references integrations(id) on delete cascade not null,
  status text check (status in ('success', 'failure', 'partial')),
  details jsonb, -- { "processed": 10, "errors": [] }
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms int
);

-- RLS: Sync Logs
alter table sync_logs enable row level security;
create policy "Users can view own logs" on sync_logs for select using (
  exists (select 1 from integrations where integrations.id = sync_logs.integration_id and integrations.user_id = auth.uid())
);
