"use client";
const KEY = 'viaeats.palmyra-price-menu';
let capturedUrl = '';
/** Menyval är beställningskontext, separat från samtyckesstyrd annonsmätning.
 * Det är en offentlig meny, aldrig identitetsbevis eller privat avgiftskanal. */
export function palmyraOfferChannel(): 'palmyra' | 'regular' {
  if (typeof window === 'undefined') return 'regular';
  try {
    const url = new URL(window.location.href);
    if (capturedUrl !== url.href) {
      capturedUrl = url.href;
      const source = (url.searchParams.get('utm_source') || '').toLowerCase();
      const ref = (() => { try { return new URL(document.referrer).hostname; } catch { return ''; } })();
      const checkout = /^\/(cart|pay|order)(\/|$)/.test(url.pathname);
      if (source === 'palmyra' || (!source && /(^|\.)palmyrapizzeria\.se$/.test(ref))) sessionStorage.setItem(KEY, 'palmyra');
      else if (source || url.searchParams.has('fbclid') || (!checkout && !ref)) sessionStorage.removeItem(KEY);
      const code = url.searchParams.get('code')?.toUpperCase() || '';
      if (['VIA50', 'VIA70'].includes(code)) sessionStorage.setItem('viaeats.pending-code', code);
    }
    return sessionStorage.getItem(KEY) === 'palmyra' ? 'palmyra' : 'regular';
  } catch { return 'regular'; }
}
