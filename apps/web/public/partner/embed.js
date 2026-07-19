/**
 * ViaEats Partner Embed v1
 *
 * Låter en restaurang visa sin ViaEats-meny på sin egen hemsida, med varje
 * rätt klickbar rakt in i ViaEats beställningsflöde (produkt-deeplink).
 *
 * Användning på partnersajten:
 *
 *   <div data-viaeats-menu="palmyra-pizzeria-lund"></div>
 *   <script src="https://www.viaeats.se/partner/embed.js" defer></script>
 *
 * Valfria attribut på diven:
 *   data-accent="#c92a1d"   Accentfärg (priser, aktiv kategori-chip)
 *   data-ink="#17130f"      Textfärg
 *   data-hide-status        Rendera inte öppet/stängt-raden
 *
 * Kräver att partnersajtens domän finns i API:ts CORS-allowlista
 * (packages/api: DEFAULT_ORIGINS eller CORS_ALLOWED_ORIGINS).
 * `window.VIAEATS_API` kan sättas före laddning för att peka om API:t (dev).
 */
(function () {
  "use strict";

  var API = (typeof window !== "undefined" && window.VIAEATS_API) || "https://api.viaeats.se";
  var SITE = "https://www.viaeats.se";
  var STYLE_ID = "viaeats-embed-style";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function kr(value) {
    if (typeof value !== "number") return "";
    var text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
    return text + " kr";
  }

  function orderUrl(slug, productId) {
    var url = SITE + "/restaurants/" + encodeURIComponent(slug) + "?utm_source=partner&utm_medium=embed";
    if (productId) url += "&product=" + encodeURIComponent(productId);
    return url;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".ve-embed{--ve-accent:#c92a1d;--ve-ink:#17130f;--ve-muted:rgba(23,19,15,.55);--ve-line:rgba(23,19,15,.09);--ve-card:#fff;" +
      "font-family:-apple-system,'Segoe UI',Inter,sans-serif;color:var(--ve-ink)}" +
      ".ve-embed *{margin:0;padding:0;box-sizing:border-box}" +
      ".ve-status{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:800;padding:7px 13px;border-radius:999px;margin-bottom:14px;" +
      "background:rgba(44,122,63,.1);color:#2c7a3f}" +
      ".ve-status.ve-closed{background:rgba(201,42,29,.09);color:var(--ve-accent)}" +
      ".ve-status .ve-dot{width:8px;height:8px;border-radius:50%;background:currentColor}" +
      ".ve-chips{position:sticky;top:0;z-index:10;display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:10px 0 12px;scrollbar-width:none;background:inherit}" +
      ".ve-chips::-webkit-scrollbar{display:none}" +
      ".ve-chip{flex:none;font:inherit;font-size:13px;font-weight:800;white-space:nowrap;padding:9px 15px;border-radius:999px;background:var(--ve-card);border:1px solid var(--ve-line);color:var(--ve-ink);cursor:pointer}" +
      ".ve-chip.ve-active{background:var(--ve-ink);color:#fff;border-color:var(--ve-ink)}" +
      ".ve-cat{margin-top:24px;scroll-margin-top:76px}" +
      ".ve-cat h3{font-size:20px;font-weight:900;letter-spacing:-.4px;margin-bottom:12px}" +
      ".ve-items{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      "@media(max-width:720px){.ve-items{grid-template-columns:1fr}}" +
      ".ve-item{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;background:var(--ve-card);border:1px solid var(--ve-line);border-radius:16px;padding:13px 14px;text-decoration:none;color:inherit;transition:transform .22s,box-shadow .22s}" +
      ".ve-item:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(23,19,15,.08)}" +
      ".ve-item h4{font-size:15px;font-weight:900}" +
      ".ve-item p{margin-top:3px;font-size:12.5px;line-height:1.45;color:var(--ve-muted);font-weight:500}" +
      ".ve-tags{margin-top:5px;display:flex;gap:5px;flex-wrap:wrap}" +
      ".ve-tag{font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#2c7a3f;background:rgba(44,122,63,.09);border-radius:6px;padding:2px 7px}" +
      ".ve-right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:8px}" +
      ".ve-price{color:var(--ve-accent);font-weight:900;font-size:14px;white-space:nowrap}" +
      ".ve-photo{width:62px;height:62px;border-radius:12px;object-fit:cover;background:rgba(23,19,15,.04)}" +
      ".ve-footer{display:flex;justify-content:center;margin-top:22px}" +
      ".ve-powered{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:.4px;color:var(--ve-muted);text-decoration:none;border:1px solid var(--ve-line);border-radius:999px;padding:6px 12px;background:var(--ve-card)}" +
      ".ve-powered b{color:#f04f1a;font-weight:900}";
    document.head.appendChild(style);
  }

  function renderTags(item) {
    var tags = [];
    if (item.isVegan) tags.push("Vegansk");
    else if (item.isVegetarian) tags.push("Vegetarisk");
    if (item.isGlutenFree) tags.push("Glutenfri");
    if (!tags.length) return "";
    return '<div class="ve-tags">' + tags.map(function (t) {
      return '<span class="ve-tag">' + t + "</span>";
    }).join("") + "</div>";
  }

  function renderItem(slug, item) {
    return (
      '<a class="ve-item" href="' + esc(orderUrl(slug, item.id)) + '" target="_blank" rel="noopener">' +
        '<div class="ve-text">' +
          "<h4>" + esc(item.name) + "</h4>" +
          (item.description ? "<p>" + esc(item.description) + "</p>" : "") +
          renderTags(item) +
        "</div>" +
        '<div class="ve-right">' +
          (item.imageUrl ? '<img class="ve-photo" src="' + esc(item.imageUrl) + '" alt="" loading="lazy">' : "") +
          '<span class="ve-price">' + kr(item.price) + "</span>" +
        "</div>" +
      "</a>"
    );
  }

  function render(host, slug, restaurant) {
    var categories = (restaurant.menu || []).filter(function (c) {
      return (c.items || []).length > 0;
    });
    if (!categories.length) return;

    var showStatus = !host.hasAttribute("data-hide-status");
    var open = restaurant.isOpen !== false;
    var uid = "ve" + Math.random().toString(36).slice(2, 8);

    var html = '<div class="ve-embed">';
    if (showStatus) {
      html +=
        '<span class="ve-status' + (open ? "" : " ve-closed") + '"><span class="ve-dot"></span>' +
        (open ? "Öppet nu" : "Stängt just nu") +
        (open && typeof restaurant.etaMinutes === "number" ? " · leverans ca " + esc(restaurant.etaMinutes) + " min" : "") +
        "</span>";
    }
    html += '<div class="ve-chips">' + categories.map(function (c, i) {
      return '<button class="ve-chip' + (i === 0 ? " ve-active" : "") + '" data-target="' + uid + "-" + i + '">' + esc(c.name) + "</button>";
    }).join("") + "</div>";
    html += categories.map(function (c, i) {
      return (
        '<div class="ve-cat" id="' + uid + "-" + i + '">' +
          "<h3>" + esc(c.name) + "</h3>" +
          '<div class="ve-items">' + (c.items || []).map(function (item) { return renderItem(slug, item); }).join("") + "</div>" +
        "</div>"
      );
    }).join("");
    html +=
      '<div class="ve-footer"><a class="ve-powered" href="' + SITE + '" target="_blank" rel="noopener">Powered by <b>ViaEats</b></a></div>' +
      "</div>";

    host.innerHTML = html;

    var chipRow = host.querySelector(".ve-chips");
    function setActive(chip) {
      chipRow.querySelectorAll(".ve-chip").forEach(function (c) {
        c.classList.toggle("ve-active", c === chip);
      });
    }
    chipRow.addEventListener("click", function (e) {
      var chip = e.target.closest(".ve-chip");
      if (!chip) return;
      setActive(chip);
      var target = host.querySelector("#" + chip.getAttribute("data-target"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if ("IntersectionObserver" in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var chip = chipRow.querySelector('[data-target="' + entry.target.id + '"]');
          if (!chip) return;
          setActive(chip);
          chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        });
      }, { rootMargin: "-80px 0px -70% 0px" });
      host.querySelectorAll(".ve-cat").forEach(function (el) { spy.observe(el); });
    }

    var accent = host.getAttribute("data-accent");
    var ink = host.getAttribute("data-ink");
    var root = host.querySelector(".ve-embed");
    if (accent) root.style.setProperty("--ve-accent", accent);
    if (ink) root.style.setProperty("--ve-ink", ink);

    host.dispatchEvent(new CustomEvent("viaeats:loaded", { detail: { restaurant: restaurant } }));
  }

  function init(host) {
    var slug = host.getAttribute("data-viaeats-menu");
    if (!slug || host.getAttribute("data-ve-initialized")) return;
    host.setAttribute("data-ve-initialized", "1");
    fetch(API + "/api/restaurants/" + encodeURIComponent(slug))
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)); })
      .then(function (data) {
        injectStyles();
        render(host, slug, data.restaurant || data);
      })
      .catch(function (err) {
        // Partnersajten behåller sitt eget fallback-innehåll; vi rör inget.
        host.dispatchEvent(new CustomEvent("viaeats:error", { detail: { error: String(err) } }));
      });
  }

  function boot() {
    document.querySelectorAll("[data-viaeats-menu]").forEach(init);
  }

  window.ViaEatsEmbed = { init: boot, orderUrl: orderUrl };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
