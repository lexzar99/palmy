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
  var HOST_ORDER_HISTORY_PREFIX = "viaeats_partner_orders_v1:";
  var volatileHostOrders = {};

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
      ".ve-embed-shell{position:relative;height:100dvh;min-height:0;overflow:hidden;background:var(--bg-primary,#fff)}" +
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

  function trustedPartnerOrigin(origin) {
    return origin === "https://palmyrapizzeria.se" ||
      origin === "https://www.palmyrapizzeria.se" ||
      origin === "http://localhost:3000" ||
      origin === "http://localhost:4000";
  }

  function validOrderId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  }

  function hostOrderIds(slug) {
    var fallback = volatileHostOrders[slug] || [];
    try {
      var parsed = JSON.parse(window.localStorage.getItem(HOST_ORDER_HISTORY_PREFIX + slug) || "[]");
      if (!Array.isArray(parsed)) return fallback;
      var ids = parsed.filter(validOrderId).slice(0, 20);
      volatileHostOrders[slug] = ids;
      return ids;
    } catch (_) {
      return fallback;
    }
  }

  function rememberHostOrder(slug, orderId) {
    if (!validOrderId(orderId)) return;
    var next = [orderId].concat(hostOrderIds(slug).filter(function (id) { return id !== orderId; })).slice(0, 20);
    volatileHostOrders[slug] = next;
    try {
      window.localStorage.setItem(HOST_ORDER_HISTORY_PREFIX + slug, JSON.stringify(next));
    } catch (_) {
      // Privat läge kan blockera lagring; minneskopian räcker för fliken.
    }
  }

  function renderStatus(host, restaurant) {
    host.dispatchEvent(new CustomEvent("viaeats:loaded", { detail: { restaurant: restaurant } }));
  }

  function mollieCheckoutUrl(raw) {
    if (typeof raw !== "string" || raw.length > 2048) return null;
    try {
      var parsed = new URL(raw);
      var mollieHost = parsed.hostname === "mollie.com" || parsed.hostname.endsWith(".mollie.com");
      if (parsed.protocol !== "https:" || !mollieHost || parsed.username || parsed.password) return null;
      return parsed.toString();
    } catch (_) {
      return null;
    }
  }

  function init(host) {
    var slug = host.getAttribute("data-viaeats-menu");
    if (!slug || host.getAttribute("data-ve-initialized")) return;
    host.setAttribute("data-ve-initialized", "1");
    injectStyles();
    host.innerHTML = '<div class="ve-embed-shell"><div class="ve-embed-loading">Laddar meny…</div></div>';
    var shell = host.querySelector(".ve-embed-shell");
    var fullViewport = host.getAttribute("data-viaeats-fullscreen") === "1";
    var pageParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    var requestedProduct = pageParams.get("product");
    var paymentReturn = pageParams.get("payment_return");
    var trackedOrder = pageParams.get("order");
    if (validOrderId(trackedOrder)) rememberHostOrder(slug, trackedOrder);

    var frame = document.createElement("iframe");
    frame.className = "ve-embed-frame";
    frame.title = "Beställ från " + slug;
    frame.loading = "eager";
    frame.allow = "payment *";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    if (fullViewport) {
      // The partner shell owns the viewport (and may have a small header), so
      // the iframe must fill that shell instead of adding another 100dvh.
      shell.style.height = "100%";
      frame.style.height = "100%";
      frame.style.minHeight = "0";
    }
    var frameUrl;
    if (validOrderId(paymentReturn)) {
      frameUrl = new URL(SITE + "/cart");
      frameUrl.searchParams.set("payment_return", paymentReturn);
      frameUrl.searchParams.set("embed", "1");
      frameUrl.searchParams.set("restaurant", slug);
    } else if (validOrderId(trackedOrder)) {
      frameUrl = new URL(SITE + "/order/" + encodeURIComponent(trackedOrder));
      frameUrl.searchParams.set("embed", "1");
      frameUrl.searchParams.set("restaurant", slug);
    } else {
      frameUrl = new URL(SITE + "/embed/" + encodeURIComponent(slug));
    }
    if (trustedPartnerOrigin(window.location.origin)) {
      frameUrl.searchParams.set("parent_origin", window.location.origin);
    }
    frame.src = frameUrl.toString();

    function sendHostOrderHistory() {
      frame.contentWindow?.postMessage({
        type: "viaeats:host-order-history",
        restaurantSlug: slug,
        orderIds: hostOrderIds(slug),
      }, SITE);
    }

    frame.addEventListener("load", function () {
      shell.classList.add("is-loaded");
      host.dispatchEvent(new CustomEvent("viaeats:ready", { detail: { slug: slug, iframe: frame } }));
      window.setTimeout(sendHostOrderHistory, 80);
      if (requestedProduct) {
        window.setTimeout(function () {
          frame.contentWindow?.postMessage({ type: "viaeats:open-product", productId: requestedProduct }, "*");
        }, 120);
      }
    });

    window.addEventListener("message", function (event) {
      if (!allowedParentOrigin(event.origin) || event.source !== frame.contentWindow || !event.data) return;

      if (event.data.type === "viaeats:open-payment") {
        var checkoutUrl = mollieCheckoutUrl(event.data.checkoutUrl);
        if (checkoutUrl) window.location.assign(checkoutUrl);
        return;
      }

      if (event.data.type === "viaeats:payment-complete") {
        var completedOrder = event.data.orderId;
        if (!validOrderId(completedOrder)) return;
        rememberHostOrder(slug, completedOrder);
        var trackingLocation = new URL(window.location.href);
        trackingLocation.search = "";
        trackingLocation.searchParams.set("order", completedOrder);
        trackingLocation.searchParams.set("restaurant", slug);
        window.history.replaceState({}, "", trackingLocation.toString());
        return;
      }

      if (event.data.type === "viaeats:remember-order") {
        if (event.data.restaurantSlug !== slug || !validOrderId(event.data.orderId)) return;
        rememberHostOrder(slug, event.data.orderId);
        sendHostOrderHistory();
        return;
      }

      if (event.data.type === "viaeats:request-order-history") {
        if (event.data.restaurantSlug !== slug) return;
        sendHostOrderHistory();
        return;
      }

      if (event.data.type === "viaeats:embed-height") {
        if (fullViewport) return;
        var height = Number(event.data.height);
        if (Number.isFinite(height)) frame.style.height = Math.max(720, Math.ceil(height)) + "px";
      }
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
