import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabaseAdmin = Boolean(supabaseUrl && supabaseServiceRoleKey);

if (!hasSupabaseAdmin) {
  console.warn('⚠️ Supabase admin auth disabled: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
}

/**
 * Backend Supabase admin client — uses the SERVICE ROLE key.
 * Never expose this to the frontend.
 */
const supabaseAdmin = hasSupabaseAdmin
  ? createClient(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export default supabaseAdmin;
