
import 'dotenv/config';
import { getConnectionManager } from '../mysql/connection-manager.js';
import { createComponentLogger } from '../utils/logger.js';
import { getSupabaseClient } from '../utils/supabase.js';

const logger = createComponentLogger('DebugSupabase');

async function testSupabase() {
    try {
        console.log('--- Starting Supabase Access Test ---');

        const manager = getConnectionManager();
        console.log('Fetching active connections...');

        const connections = await manager.getActiveConnections();
        console.log(`Active Connections Found: ${connections.length}`);

        if (connections.length > 0) {
            console.log('First connection:', connections[0]);
        } else {
            console.log('No active connections found via ConnectionManager.');

            // Try direct Supabase query to see if ANY exist (ignoring status?)
            const supabase = getSupabaseClient();
            const { data, error, count } = await supabase.from('user_integrations').select('connection_name, status, id, mysql_table_name', { count: 'exact' });
            if (error) {
                console.error('Direct Supabase Query Error:', error);
            } else {
                console.log(`Direct Query Found: ${data?.length} rows (Total: ${count})`);
                if (data) {
                    data.forEach(row => console.log(`- [${row.status}] ${row.connection_name} (Table: ${row.mysql_table_name}) ID: ${row.id}`));
                }
            }
        }
    } catch (error) {
        console.error('ERROR:', error);
    }
}

testSupabase();
