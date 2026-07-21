// ---------------------------------------------------------------------------
//  Smart tilldelning — ren poängsättning (ingen DB, ingen IO → testbar).
//
//  Frågan motorn besvarar är ALDRIG "vem är närmast?" eller "vem har färst
//  ordrar?" utan: "med vilken kurir får KUNDEN maten snabbast, utan att vi
//  överlastar någon?". Kund-ETA:n kommer från ruttsimuleringen i orderEta.ts
//  (kurirens aktiva stopp körs först, nya ordern läggs sist — konservativt, så
//  befintliga kunder aldrig blir försenade av ett nytt uppdrag).
//
//  Klassiska scenarier och hur poängen löser dem:
//  - Bud A har 1 order och är 3 km bort; bud B har 3 ordrar men står 500 m
//    från restaurangen. Simulerad ETA avgör: B:s tre stopp körs före den nya
//    ordern, så B vinner BARA om rutten ändå levererar snabbare än A:s omväg.
//    Närhet i sig ger inget — det är levererad-hos-kund-tiden som räknas.
//  - Två lediga bud → ETA-skillnaden är i praktiken avståndet → närmast vinner.
//  - Lika ETA → belastningsstraffet (per aktiv order) ger jobbet till den med
//    färre ordrar (rättvisa + buffert för porttelefoner/trappor/väntetid som
//    simuleringen inte ser).
//  - GPS:en är gammal → simuleringen använder SENASTE KÄNDA position och
//    straffet är nästan noll (bara en mjuk knuff mot färskare bud vid dött
//    lopp). Saknas position HELT finns ingen startpunkt att simulera från —
//    då blir ETA:n orealistiskt optimistisk, så ett måttligt straff hindrar
//    ett "osynligt" bud från att vinna oförtjänt.
// ---------------------------------------------------------------------------

export type DispatchCandidate = {
  courierId: string;
  /** Simulerad tid (min) tills kunden har maten om DENNA kurir tar jobbet. */
  etaCustomerMin: number | null;
  /** Antal aktiva leveranser kuriren redan har. */
  activeCount: number;
  /** Kurirens avstånd till restaurangen (km), null om position saknas. */
  pickupDistanceKm: number | null;
  /** Det finns en (senaste känd) position alls att simulera från. */
  hasLocation: boolean;
  /** Position rapporterad nyligen nog att lita på. */
  locationFresh: boolean;
};

export type ScoredDispatchCandidate = DispatchCandidate & {
  /** Lägre = bättre. Enhet ≈ "effektiva minuter till kund". */
  score: number;
};

// Saknad ETA (t.ex. koordinater saknas) ska inte diskvalificera helt, men
// kandidaten ska hamna efter alla med en riktig simulering.
const FALLBACK_ETA_MIN = 45;
// Straff-minuter per aktiv leverans: rättvisa + buffert för att simuleringen
// underskattar verkliga stopp (porttelefoner, trappor, väntetid).
const LOAD_PENALTY_MIN = 3;
// Närhets-tiebreak: vid likvärdig ETA föredras kuriren närmare restaurangen
// (kortare exponering för fel i prognosen).
const DISTANCE_TIEBREAK_MIN_PER_KM = 0.6;
const UNKNOWN_DISTANCE_KM = 5;
// Gammal GPS → vi simulerar ändå från senaste kända position; nästan noll i
// straff (bara en mjuk knuff mot budet med färskare position vid dött lopp).
const STALE_LOCATION_PENALTY_MIN = 2;
// Ingen position ALLS → simuleringen saknar startpunkt och första benet blir
// gratis (orealistiskt optimistiskt). Måttligt straff så budet fortfarande kan
// vinna när alternativen är dåliga, men inte slår en simulerbar kandidat i
// ett jämnt läge.
const MISSING_LOCATION_PENALTY_MIN = 8;

export function computeDispatchScore(c: DispatchCandidate): number {
  const eta = c.etaCustomerMin ?? FALLBACK_ETA_MIN;
  const load = c.activeCount * LOAD_PENALTY_MIN;
  const distance = (c.pickupDistanceKm ?? UNKNOWN_DISTANCE_KM) * DISTANCE_TIEBREAK_MIN_PER_KM;
  const location = !c.hasLocation
    ? MISSING_LOCATION_PENALTY_MIN
    : c.locationFresh
      ? 0
      : STALE_LOCATION_PENALTY_MIN;
  return Math.round((eta + load + distance + location) * 10) / 10;
}

/** Sortera kandidater bäst-först (stabilt: poäng → ETA → belastning → id). */
export function rankDispatchCandidates(candidates: DispatchCandidate[]): ScoredDispatchCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: computeDispatchScore(c) }))
    .sort(
      (a, b) =>
        a.score - b.score ||
        (a.etaCustomerMin ?? FALLBACK_ETA_MIN) - (b.etaCustomerMin ?? FALLBACK_ETA_MIN) ||
        a.activeCount - b.activeCount ||
        a.courierId.localeCompare(b.courierId),
    );
}
