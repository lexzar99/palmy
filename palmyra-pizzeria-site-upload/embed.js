/**
 * ViaEats Partner Embed v2
 *
 * Laddar ViaEats kiosk-läget i en fristående iframe. Själva meny-, modal-,
 * cart-, betalnings- och trackinglogiken körs därför av ViaEats webbapp och
 * inte som kopierad kundlogik på partnersidan.
 *
 *   <div data-viaeats-menu="palmyra-pizzeria-lund"></div>
 *   <script src="embed.js" defer></script>
 */
(function () {
  "use strict";

  // Direktöppnad file://-preview ska fortfarande visa den riktiga ViaEats-
  // ytan. Lokal Next-server används bara när den uttryckligen anges via
  // window.VIAEATS_SITE.
  var SITE = (typeof window !== "undefined" && window.VIAEATS_SITE) ||
    "https://www.viaeats.se";
  var API = (typeof window !== "undefined" && window.VIAEATS_API) || "https://api.viaeats.se";
  var STYLE_ID = "viaeats-embed-v2-style";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".ve-embed-frame{display:block;width:100%;height:100dvh;min-height:100dvh;border:0;background:transparent}" +
      ".ve-embed-shell{position:relative;height:100dvh;overflow:hidden;background:var(--bg-primary,#fff)}" +
      ".ve-embed-frame{opacity:0;transition:opacity .16s ease}" +
      ".ve-embed-shell.is-loaded .ve-embed-frame{opacity:1}" +
      ".ve-embed-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;min-height:220px;color:#6b6b70;font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:opacity .16s ease}" +
      ".ve-embed-shell.is-loaded .ve-embed-loading{opacity:0;pointer-events:none}" +
      ".ve-embed-error{padding:18px;border:1px solid rgba(201,42,29,.18);border-radius:14px;color:#8f241a;background:rgba(201,42,29,.06);font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}";
    document.head.appendChild(style);
  }

  function allowedParentOrigin(origin) {
    if (origin === window.location.origin) return true;
    if (origin === SITE) return true;
    return origin === "https://palmyrapizzeria.se" ||
      origin === "https://www.palmyrapizzeria.se" ||
      origin === "http://localhost:3000" ||
      origin === "http://localhost:4000";
  }

  function renderStatus(host, restaurant) {
    host.dispatchEvent(new CustomEvent("viaeats:loaded", { detail: { restaurant: restaurant } }));
  }

  function init(host) {
    var slug = host.getAttribute("data-viaeats-menu");
    if (!slug || host.getAttribute("data-ve-initialized")) return;
    host.setAttribute("data-ve-initialized", "1");
    injectStyles();
    host.innerHTML = '<div class="ve-embed-shell"><div class="ve-embed-loading">Laddar meny…</div></div>';
    var shell = host.querySelector(".ve-embed-shell");
    var fullViewport = host.getAttribute("data-viaeats-fullscreen") === "1";
    var requestedProduct = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("product")
      : null;

    var frame = document.createElement("iframe");
    frame.className = "ve-embed-frame";
    frame.title = "Beställ från " + slug;
    frame.loading = "eager";
    frame.allow = "payment *";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.src = SITE + "/embed/" + encodeURIComponent(slug);

    frame.addEventListener("load", function () {
      shell.classList.add("is-loaded");
      host.dispatchEvent(new CustomEvent("viaeats:ready", { detail: { slug: slug, iframe: frame } }));
      if (requestedProduct) {
        window.setTimeout(function () {
          frame.contentWindow?.postMessage({ type: "viaeats:open-product", productId: requestedProduct }, "*");
        }, 120);
      }
    });

    window.addEventListener("message", function (event) {
      if (!allowedParentOrigin(event.origin)) return;
      if (!event.data || event.data.type !== "viaeats:embed-height") return;
      if (event.source !== frame.contentWindow) return;
      if (fullViewport) return;
      var height = Number(event.data.height);
      if (Number.isFinite(height)) frame.style.height = Math.max(720, Math.ceil(height)) + "px";
    });

    shell.appendChild(frame);
    fetch(API + "/api/restaurants/" + encodeURIComponent(slug))
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)); })
      .then(function (restaurant) { renderStatus(host, restaurant); })
      .catch(function () {
        // Iframe-flödet kan fortfarande laddas även om den valfria status-fetchen
        // misslyckas; partnersidan ska inte gå sönder av en extra statusfråga.
      });
  }

  function boot() {
    document.querySelectorAll("[data-viaeats-menu]").forEach(init);
  }

  window.ViaEatsEmbed = {
    init: boot,
    orderUrl: function (slug) { return SITE + "/embed/" + encodeURIComponent(slug); },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
