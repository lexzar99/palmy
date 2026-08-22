import { NextResponse, type NextRequest } from "next/server";

/**
 * Retur-URL för betalningar som gör en app-växling (Swish) från WEBBEN.
 *
 * Swish öppnar vår retur-URL som en helt vanlig https-länk. Pekar den direkt
 * på /cart matchar iOS den mot den installerade ViaEats-appen (universal link)
 * och kunden som handlade i webbläsaren kastas in i appen — både efter en
 * godkänd och en avbruten betalning. Den här sökvägen är avsiktligt INTE
 * registrerad i apple-app-site-association, så iOS lämnar den i webbläsaren.
 *
 * Redirecten sker på servern och behåller alla parametrar, så kassan får
 * exakt samma payment_return/payment_provider/payment_resume som förut.
 * En redirect INOM webbläsaren återutvärderar aldrig universal links, så
 * hoppet vidare till /cart är säkert.
 *
 * Appen använder aldrig den här vägen: native Swish återvänder via
 * viaeats://payment/return, och hostade flöden via API-bryggan.
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const destination = new URL("/cart", request.nextUrl.origin);
  // Behåll parametrarna oförändrade — payment_resume är en engångsnyckel som
  // kassan behöver för att kunna återupprätta ordersessionen.
  destination.search = request.nextUrl.search;
  return NextResponse.redirect(destination, 303);
}
