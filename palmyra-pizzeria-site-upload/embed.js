/**
 * ViaEats Partner Embed — loader
 *
 * All embed-logik ligger i https://www.viaeats.se/embed.js och deployas med
 * ViaEats webbapp. Den här filen är avsiktligt bara en laddare: den behöver
 * aldrig laddas upp till webbhotellet igen, och embed-fixar (t.ex. Swish
 * app-switch eller nya betalvärdar) når kunderna direkt vid nästa deploy.
 *
 *   <main data-viaeats-menu="palmyra-pizzeria-lund"></main>
 *   <script src="embed.js?v=9" defer></script>
 */
(function () {
  "use strict";

  var SRC = (typeof window !== "undefined" && window.VIAEATS_EMBED_SRC) ||
    "https://www.viaeats.se/embed.js";

  if (document.querySelector('script[data-viaeats-embed-loader="1"]')) return;

  var script = document.createElement("script");
  script.src = SRC;
  script.async = false;
  script.setAttribute("data-viaeats-embed-loader", "1");
  script.addEventListener("error", function () {
    document.querySelectorAll("[data-viaeats-menu]").forEach(function (host) {
      host.textContent = "Beställningen kunde inte laddas just nu. Ladda om sidan eller ring oss så tar vi din beställning.";
    });
  });
  document.head.appendChild(script);
})();
