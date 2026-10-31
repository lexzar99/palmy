/**
 * Sajtens kanoniska adress. viaeats.se 308-omdirigeras till www, så canonical, sitemap och robots
 * måste peka på www-adressen, annars får Google blandade signaler om vilken sida som gäller.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.viaeats.se")
  .replace(/\/$/, "")
  .replace("://viaeats.se", "://www.viaeats.se");
