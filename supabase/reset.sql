-- ===========================================
-- Database Reset Script
-- WARNING: This will delete all data!
-- ===========================================

-- Drop tables in dependency order
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS sync_state CASCADE;
DROP TABLE IF EXISTS column_mappings CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS mysql_connections CASCADE;
DROP TABLE IF EXISTS google_connections CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop functions and triggers
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Now copy-paste the contents of schema.sql to re-create everything
