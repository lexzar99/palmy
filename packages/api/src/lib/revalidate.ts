/**
 * Purga kund-webbens SSR-cache (Next Data Cache) för en restaurang så att
 * profil-/bild-/meny-ändringar syns direkt i stället för att vänta på den
 * tidsbaserade revalidate (1h). Fire-and-forget: gör inget om
 * REVALIDATE_SECRET + FRONTEND_URL inte är satta (t.ex. lokalt).
 *
 * Webben exponerar POST /api/revalidate som purgar taggarna
 * menu:{slug}, deals:{slug} och restaurant:{slug}.
 */
export async function revalidateWebRestaurant(slug: string | null | undefined): Promise<void> {
  if (!slug) return;
  const secret = process.env.REVALIDATE_SECRET;
  const webUrl = process.env.FRONTEND_URL;
  if (!secret || !webUrl) return;
  try {
    const axios = (await import('axios')).default;
    await axios.post(
      `${webUrl.replace(/\/$/, '')}/api/revalidate`,
      { slug },
      { headers: { 'x-revalidate-secret': secret }, timeout: 4000 },
    );
  } catch (err) {
    console.warn('[revalidate] web revalidate failed', (err as any)?.message ?? err);
  }
}
