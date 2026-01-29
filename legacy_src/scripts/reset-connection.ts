
import 'dotenv/config';
import { getSupabaseClient } from '../utils/supabase.js';

async function resetConnection() {
    try {
        console.log('--- Resetting Connection Status ---');

        const supabase = getSupabaseClient();
        const connectionId = '68d72c06-ddf2-4329-acd0-4a3da83a23a5'; // Browser Test Connection

        const { data, error } = await supabase
            .from('user_integrations')
            .update({ status: 'active' })
            .eq('id', connectionId)
            .select();

        if (error) {
            console.error('Error updating status:', error);
        } else {
            console.log('Status updated to active:', data);
        }

    } catch (error) {
        console.error('ERROR:', error);
    }
}

resetConnection();
