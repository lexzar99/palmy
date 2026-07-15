import supabaseAdmin from './supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normPhone = (p?: string | null) => (p || '').replace(/[^\d]/g, '');

// Radera ALLA Supabase-auth-användare som matchar kontot — primär (vår User.id
// eller oauthId) OCH separata användare med samma e-post/telefon (t.ex. en
// telefon-OTP-användare vid sidan av Google-användaren). Annars blir numret kvar
// som "upptaget" i Supabase och blockerar nästa verifiering. Delad av admin-
// kundradering (customers.ts) och kundens egen kontoradering (profile.ts).
export async function deleteSupabaseAuthUser(u: {
  id: string;
  email: string | null;
  phone: string | null;
  oauthId: string | null;
}) {
  if (!supabaseAdmin) return;
  try {
    const ids = new Set<string>();
    if (UUID_RE.test(u.id)) ids.add(u.id);
    if (u.oauthId && UUID_RE.test(u.oauthId)) ids.add(u.oauthId);
    if (u.email || u.phone) {
      // listUsers is paginated. Looking only at page one leaves older
      // identities alive once the project has more than 200 auth users.
      const perPage = 200;
      for (let page = 1; page <= 10_000; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const users = (data?.users as any[]) || [];
        for (const su of users) {
          const emailMatch = u.email && su.email?.toLowerCase() === u.email.toLowerCase();
          const phoneMatch = u.phone && su.phone && normPhone(su.phone) === normPhone(u.phone);
          if (emailMatch || phoneMatch) ids.add(su.id);
        }
        if (users.length < perPage) break;
      }
    }
    for (const sid of ids) {
      await supabaseAdmin.auth.admin.deleteUser(sid).catch((e: any) =>
        console.error('[delete user] Supabase delete', sid, e?.message),
      );
    }
  } catch (e: any) {
    console.error('[delete user] Supabase cascade failed:', e?.message);
  }
}
