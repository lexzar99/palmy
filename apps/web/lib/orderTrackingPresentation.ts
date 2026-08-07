const ON_WAY_STATUSES = ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"];
const DONE_STATUSES = ["DELIVERED", "COMPLETED"];

export type OrderTrackingCopy = {
  title: string;
  short: string;
  description: string;
};

export function normalizedOrderStatus(order: any): string {
  return String(order?.status || "PENDING").toUpperCase();
}
export function orderTrackingCopy(order: any): OrderTrackingCopy {
  const status = normalizedOrderStatus(order);
  const type = String(order?.orderType || order?.type || "DELIVERY").toUpperCase();
  const pickup = type === "PICKUP";
  const selfDelivery = type === "DELIVERY" && Boolean(order?.selfDelivery);
  const restaurant = order?.restaurantName || order?.restaurant?.name || "Restaurangen";

  switch (status) {
    case "AWAITING_PAYMENT":
      return {
        title: "Väntar på betalning",
        short: "Betalningen behöver slutföras",
        description: "Beställningen skickas till restaurangen så snart betalningen är bekräftad.",
      };
    case "PENDING":
      return {
        title: "Väntar på bekräftelse",
        short: "Skickad till restaurangen",
        description: `Din beställning är skickad till ${restaurant}. Vi uppdaterar sidan direkt när köket svarar.`,
      };
    case "ACCEPTED":
      return {
        title: "Beställningen är bekräftad",
        short: "Bekräftad av restaurangen",
        description: `${restaurant} har tagit emot beställningen. Tiden du ser är restaurangens senaste besked.`,
      };
    case "PREPARING":
      return {
        title: "Maten tillagas",
        short: "Köket lagar din mat",
        description: pickup
          ? "Köket lagar din mat. Vi säger till så snart den är redo att hämtas."
          : selfDelivery
            ? `Köket lagar din mat. ${restaurant} kör ut den till dig när den är klar.`
            : "Köket lagar din mat. Ett ViaEats-bud hämtar den när den är klar.",
      };
    case "READY":
      return pickup
        ? {
            title: "Klar för hämtning",
            short: "Din mat väntar",
            description: "Visa ordernumret i restaurangen när du hämtar beställningen.",
          }
        : selfDelivery
          ? {
              title: "Maten är klar",
              short: "Restaurangen förbereder utkörningen",
              description: `${restaurant} sköter leveransen och förbereder nu utkörningen. Du behöver inte hämta maten själv.`,
            }
          : {
              title: "Maten är klar",
              short: "Ett ViaEats-bud hämtar snart",
              description: "Maten väntar på restaurangen medan vi skickar ett ViaEats-bud som levererar den till dig.",
            };
    case "DELIVERING":
    case "OUT_FOR_DELIVERY":
    case "ON_THE_WAY":
      return selfDelivery
        ? {
            title: "Restaurangen är på väg",
            short: "På väg till dig",
            description: `${restaurant} har lämnat restaurangen och kör nu beställningen till dig.`,
          }
        : {
            title: "Budet är på väg",
            short: "På väg till dig",
            description: "ViaEats-budet har hämtat maten och är på väg till din adress. Ankomsttiden uppdateras live.",
          };
    case "DELIVERED":
    case "COMPLETED":
      return {
        title: pickup ? "Beställningen är hämtad" : "Beställningen är levererad",
        short: pickup ? "Hämtad" : "Levererad",
        description: "Klart! Tack för att du beställde lokalt med ViaEats.",
      };
    case "REJECTED":
      return {
        title: "Restaurangen kunde inte ta emot ordern",
        short: "Ordern avböjdes",
        description: `${restaurant} kunde tyvärr inte ta emot beställningen. Betalningen återbetalas enligt betalningsstatusen.`,
      };
    case "DELIVERY_FAILED":
      return {
        title: "Leveransen kunde inte slutföras",
        short: "Leveransproblem",
        description: "Kontakta support om betalningen eller leveransen behöver följas upp.",
      };
    case "CANCELLED":
      return {
        title: "Beställningen är avbruten",
        short: "Avbruten",
        description: "Beställningen har avbrutits. Kontrollera betalningsstatusen i orderinformationen.",
      };
    default:
      return {
        title: "Beställningen uppdateras",
        short: "Status uppdateras",
        description: "Vi hämtar den senaste informationen från restaurangen.",
      };
  }
}

export function orderTrackingProgress(order: any): { labels: string[]; activeIndex: number } {
  const status = normalizedOrderStatus(order);
  const type = String(order?.orderType || order?.type || "DELIVERY").toUpperCase();
  const pickup = type === "PICKUP";
  const firstLabel = status === "PENDING" || status === "AWAITING_PAYMENT" ? "Skickad" : "Bekräftad";

  if (pickup) {
    // Samma ord som i andningsvyn — "På väg" finns inte vid avhämtning.
    const labels = [firstLabel, "Tillagas", "Klar för hämtning"];
    if (DONE_STATUSES.includes(status) || status === "READY") return { labels, activeIndex: 2 };
    if (status === "PREPARING") return { labels, activeIndex: 1 };
    return { labels, activeIndex: 0 };
  }

  const labels = [firstLabel, status === "READY" ? "Maten klar" : "Tillagas", "På väg", "Levererad"];
  if (DONE_STATUSES.includes(status)) return { labels, activeIndex: 3 };
  if (ON_WAY_STATUSES.includes(status)) return { labels, activeIndex: 2 };
  if (status === "PREPARING" || status === "READY") return { labels, activeIndex: 1 };
  return { labels, activeIndex: 0 };
}
