import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const hasSupabaseAdmin = Boolean(supabaseUrl && supabaseServiceRoleKey);
export const hasSupabasePublic = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseAdmin) {
  console.warn('⚠️ Supabase admin auth disabled: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
}
if (!hasSupabasePublic) {
  console.warn('⚠️ Supabase public client disabled: SUPABASE_URL or SUPABASE_ANON_KEY is missing — email-verification/reset via Supabase kommer inte funka');
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

/**
 * Public Supabase client — uses anon key. Safe att exponera, men vi
 * använder den från backend för att kunna kalla `auth.signUp()` och
 * `auth.resetPasswordForEmail()` som triggar Supabase att skicka
 * verifierings/reset-emails. Detta är gratis-pathen som inte kräver
 * Brevo eller egen domän.
 */
export const supabasePublic = hasSupabasePublic
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export default supabaseAdmin;
