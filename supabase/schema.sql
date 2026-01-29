-- ===========================================
-- Google Sheets ↔ MySQL Sync Platform
-- Supabase Database Schema
-- ===========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- Tenants Table (Multi-tenant support)
-- ===========================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);

-- ===========================================
-- Google Connections Table
-- ===========================================
CREATE TABLE IF NOT EXISTS google_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_connections_tenant ON google_connections(tenant_id);

-- ===========================================
-- MySQL Connections Table
-- ===========================================
CREATE TABLE IF NOT EXISTS mysql_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 3306,
  database TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT TRUE,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mysql_connections_tenant ON mysql_connections(tenant_id);

-- ===========================================
-- Integrations Table
-- ===========================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  google_connection_id UUID NOT NULL REFERENCES google_connections(id) ON DELETE RESTRICT,
  mysql_connection_id UUID NOT NULL REFERENCES mysql_connections(id) ON DELETE RESTRICT,
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('sheets_to_mysql', 'mysql_to_sheets', 'bidirectional')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'pending')),
  error_message TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integrations_google_conn ON integrations(google_connection_id);
CREATE INDEX IF NOT EXISTS idx_integrations_mysql_conn ON integrations(mysql_connection_id);

-- ===========================================
-- Column Mappings Table
-- ===========================================
CREATE TABLE IF NOT EXISTS column_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  sheet_column TEXT NOT NULL,
  mysql_column TEXT NOT NULL,
  data_type TEXT NOT NULL,
  is_primary_key BOOLEAN DEFAULT FALSE,
  transform_function TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_column_mappings_integration ON column_mappings(integration_id);

-- ===========================================
-- Sync State Table
-- ===========================================
CREATE TABLE IF NOT EXISTS sync_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL UNIQUE REFERENCES integrations(id) ON DELETE CASCADE,
  last_sync_version INTEGER DEFAULT 0,
  sheets_hash TEXT,
  mysql_hash TEXT,
  conflict_resolution TEXT DEFAULT 'latest_wins' CHECK (conflict_resolution IN ('latest_wins', 'sheets_priority', 'mysql_priority', 'manual')),
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Sync Logs Table
-- ===========================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  direction TEXT NOT NULL CHECK (direction IN ('sheets_to_mysql', 'mysql_to_sheets')),
  rows_processed INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_deleted INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_integration ON sync_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- ===========================================
-- Row Level Security (RLS) Policies
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE mysql_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Tenants: Users can only access their own tenant
CREATE POLICY tenant_select ON tenants FOR SELECT 
  USING (user_id = auth.uid());

CREATE POLICY tenant_insert ON tenants FOR INSERT 
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tenant_update ON tenants FOR UPDATE 
  USING (user_id = auth.uid());

CREATE POLICY tenant_delete ON tenants FOR DELETE 
  USING (user_id = auth.uid());

-- Google Connections: Access through tenant
CREATE POLICY google_conn_select ON google_connections FOR SELECT 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY google_conn_insert ON google_connections FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY google_conn_update ON google_connections FOR UPDATE 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY google_conn_delete ON google_connections FOR DELETE 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

-- MySQL Connections: Access through tenant
CREATE POLICY mysql_conn_select ON mysql_connections FOR SELECT 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY mysql_conn_insert ON mysql_connections FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY mysql_conn_update ON mysql_connections FOR UPDATE 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY mysql_conn_delete ON mysql_connections FOR DELETE 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

-- Integrations: Access through tenant
CREATE POLICY integration_select ON integrations FOR SELECT 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY integration_insert ON integrations FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY integration_update ON integrations FOR UPDATE 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

CREATE POLICY integration_delete ON integrations FOR DELETE 
  USING (tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid()));

-- Column Mappings: Access through integration's tenant
CREATE POLICY column_mapping_select ON column_mappings FOR SELECT 
  USING (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

CREATE POLICY column_mapping_insert ON column_mappings FOR INSERT 
  WITH CHECK (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

CREATE POLICY column_mapping_delete ON column_mappings FOR DELETE 
  USING (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

-- Sync State: Access through integration's tenant
CREATE POLICY sync_state_select ON sync_state FOR SELECT 
  USING (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

CREATE POLICY sync_state_insert ON sync_state FOR INSERT 
  WITH CHECK (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

CREATE POLICY sync_state_update ON sync_state FOR UPDATE 
  USING (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

-- Sync Logs: Access through integration's tenant
CREATE POLICY sync_logs_select ON sync_logs FOR SELECT 
  USING (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

CREATE POLICY sync_logs_insert ON sync_logs FOR INSERT 
  WITH CHECK (integration_id IN (
    SELECT id FROM integrations 
    WHERE tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  ));

-- ===========================================
-- Service Role Policies (bypass RLS)
-- ===========================================
-- The service role key bypasses RLS by default in Supabase.
-- The backend server uses the service role key for all operations.

-- ===========================================
-- Functions for automatic timestamp updates
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_google_connections_updated_at
  BEFORE UPDATE ON google_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mysql_connections_updated_at
  BEFORE UPDATE ON mysql_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_state_updated_at
  BEFORE UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- Function to create tenant on user signup
-- ===========================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenants (user_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
