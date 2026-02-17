/* eslint-disable no-console */
/**
 * SCORE STORE — main.js (production)
 * - Catálogo por edición
 * - Carrito con envío dentro del carrito
 * - Promo code (valida en backend /api/checkout)
 * - Score AI (/api/chat)
 * - Meta Pixel con consentimiento
 */

const CONFIG = {
  catalogUrl: "/data/catalog.json",
  promosUrl: "/data/promos.json",
  legalUrl: "/data/legal.json",
  partnersUrl: "/data/partners.json",

  checkoutUrl: "/api/checkout",
  aiUrl: "/api/chat",

  currency: "MXN",
  locale: "es-MX",

  // Meta Pixel
  metaPixelId: "4249947775334413",
  cookieKey: "scorestore_cookie_consent_v1",
};

const STATE = {
  catalog: null,
  sections: [],
  products: [],
  promos: null,
  partners: null,
  legal: null,

  selectedSectionId: null,
  cart: [],
  promoCode: "",
  promoPreview: null,

  shipping: {
    mode: "pickup", // pickup | local_tj | envia_mx | envia_us
    postal: "",
    quote: null,
    loading: false,
  },

  ai: {
    open: false,
    messages: [],
    loading: false,
  },
};

// ---------- utils ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(u) {
  const s = String(u || "");
  if (!s) return "";
  try {
    return encodeURI(s);
  } catch {
    return s;
  }
}

function fmtMoney(mxn) {
  const n = Number(mxn);
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(CONFIG.locale, {
    style: "currency",
    currency: CONFIG.currency,
    maximumFractionDigits: 0,
  });
}

function sumCartQty() {
  return STATE.cart.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
}

function sumCartSubtotalCents() {
  let total = 0;
  for (const it of STATE.cart) {
    const p = STATE.products.find((x) => x.sku === it.sku);
    if (!p) continue;
    total += (Number(p.price_cents) || 0) * (Number(it.qty) || 0);
  }
  return total;
}

function toCents(mxn) {
  const n = Number(mxn);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function fromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n / 100);
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setOverlay(on) {
  const ov = $("#pageOverlay");
  if (!ov) return;
  ov.classList.toggle("show", !!on);
  ov.setAttribute("aria-hidden", on ? "false" : "true");
}

function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
  setOverlay(true);
}

function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
  setOverlay(false);
}

function openDrawer() {
  const dr = $("#cartDrawer");
  if (!dr) return;
  dr.classList.add("open");
  dr.setAttribute("aria-hidden", "false");
  setOverlay(true);
}

function closeDrawer() {
  const dr = $("#cartDrawer");
  if (!dr) return;
  dr.classList.remove("open");
  dr.setAttribute("aria-hidden", "true");
  setOverlay(false);
}

// ---------- cookie consent / pixel ----------
function getConsent() {
  try {
    const v = localStorage.getItem(CONFIG.cookieKey);
    return v === "accept" ? "accept" : v === "reject" ? "reject" : null;
  } catch {
    return null;
  }
}

function setConsent(val) {
  try {
    localStorage.setItem(CONFIG.cookieKey, val);
  } catch {}
}

function loadMetaPixel() {
  if (!CONFIG.metaPixelId) return;
  if (window.fbq) return;

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  fbq("init", CONFIG.metaPixelId);
  fbq("track", "PageView");
  /* eslint-enable */
}

function showCookieBannerIfNeeded() {
  const consent = getConsent();
  const banner = $("#cookieBanner");
  if (!banner) return;

  if (!consent) {
    banner.style.display = "block";
    banner.setAttribute("aria-hidden", "false");
  } else {
    banner.style.display = "none";
    banner.setAttribute("aria-hidden", "true");
    if (consent === "accept") loadMetaPixel();
  }
}

function bindCookieButtons() {
  $("#cookieAcceptBtn")?.addEventListener("click", () => {
    setConsent("accept");
    loadMetaPixel();
    const banner = $("#cookieBanner");
    if (banner) banner.style.display = "none";
  });

  $("#cookieRejectBtn")?.addEventListener("click", () => {
    setConsent("reject");
    const banner = $("#cookieBanner");
    if (banner) banner.style.display = "none";
  });
}

// ---------- catalog rendering ----------
function renderEditionGrid() {
  const grid = $("#editionGrid");
  if (!grid) return;

  const active = STATE.sections.filter((s) => s?.active !== false);
  if (!active.length) {
    grid.innerHTML = `<div class="heroCard" style="padding:14px">No hay catálogos disponibles.</div>`;
    return;
  }

  grid.innerHTML = active
    .map((s) => {
      const meta = s.meta ? `<div class="editionMeta">${esc(s.meta)}</div>` : "";
      const subtitle = s.subtitle ? `<div class="editionSub">${esc(s.subtitle)}</div>` : "";
      return `
      <button class="editionCard" type="button" data-edition="${esc(s.id)}">
        <img class="editionCover" src="${safeUrl(s.cover)}" alt="${esc(s.name)}" loading="lazy" />
        <div class="editionOverlay"></div>
        <div class="editionInner">
          <div class="editionHeader">
            <img class="editionLogo" src="${safeUrl(s.logo)}" alt="${esc(s.name)}" loading="lazy" />
            <div>
              <div class="editionTitle">${esc(s.name)}</div>
              ${subtitle}
              ${meta}
            </div>
          </div>
        </div>
      </button>
      `;
    })
    .join("");

  $$("[data-edition]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edition");
      if (!id) return;
      openSection(id);
    });
  });
}

function renderProductsGrid(sectionId) {
  const grid = $("#productsGrid");
  const title = $("#editionTitle");
  const meta = $("#editionMeta");
  const chips = $("#chips");
  const panel = $("#productsPanel") || $("#productsView");
  const editionsSection = $("#editions");

  if (!grid || !panel || !editionsSection) return;

  const s = STATE.sections.find((x) => x.id === sectionId);
  const products = STATE.products.filter((p) => p.sectionId === sectionId);

  if (title) title.textContent = s?.name || "Edición";
  if (meta) meta.textContent = s?.meta || "Selecciona un producto para ver detalles.";

  if (chips) chips.innerHTML = "";

  if (!products.length) {
    grid.innerHTML = `<div class="heroCard" style="padding:14px">No hay productos en esta edición.</div>`;
  } else {
    grid.innerHTML = products
      .map((p) => {
        const price = fmtMoney(fromCents(p.price_cents));
        return `
        <button class="productCard" type="button" data-sku="${esc(p.sku)}">
          <img class="productImg" src="${safeUrl(p.img)}" alt="${esc(p.name)}" loading="lazy" />
          <div class="productBody">
            <div class="productName">${esc(p.name)}</div>
            <div class="productPrice">${esc(price)}</div>
          </div>
        </button>
        `;
      })
      .join("");
  }

  $$("[data-sku]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sku = btn.getAttribute("data-sku");
      if (!sku) return;
      openProduct(sku);
    });
  });

  panel.classList.remove("hide");
  editionsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openSection(sectionId) {
  STATE.selectedSectionId = sectionId;
  renderProductsGrid(sectionId);

  const url = new URL(window.location.href);
  url.searchParams.set("edition", sectionId);
  window.history.replaceState({}, "", url.toString());
}

function closeSection() {
  STATE.selectedSectionId = null;
  ($("#productsPanel") || $("#productsView"))?.classList.add("hide");

  const url = new URL(window.location.href);
  url.searchParams.delete("edition");
  window.history.replaceState({}, "", url.toString());
}

// ---------- product modal ----------
function openProduct(sku) {
  const p = STATE.products.find((x) => x.sku === sku);
  if (!p) return;

  const body = $("#productBody");
  const title = $("#productTitle");
  if (title) title.textContent = p.name || "Producto";

  const imgs = Array.isArray(p.images) && p.images.length ? p.images : p.img ? [p.img] : [];
  const price = fmtMoney(fromCents(p.price_cents));

  if (body) {
    body.innerHTML = `
      <div class="productModalGrid">
        <div class="gallery">
          ${imgs
            .map(
              (u) =>
                `<img class="galleryImg" src="${safeUrl(u)}" alt="${esc(p.name)}" loading="lazy" />`
            )
            .join("")}
        </div>

        <div class="details">
          <div class="priceBig">${esc(price)}</div>
          <div class="desc">${esc(p.desc || "")}</div>

          <div class="row">
            <label class="label">Talla</label>
            <select id="sizeSelect" class="select">
              ${(Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL", "XXL"])
                .map((x) => `<option value="${esc(x)}">${esc(x)}</option>`)
                .join("")}
            </select>
          </div>

          <div class="row">
            <label class="label">Cantidad</label>
            <div class="qtyRow">
              <button id="qtyMinus" class="iconBtn" type="button" aria-label="Menos">−</button>
              <input id="qtyInput" class="input qtyInput" value="1" inputmode="numeric" />
              <button id="qtyPlus" class="iconBtn" type="button" aria-label="Más">+</button>
            </div>
          </div>

          <button id="addToCartBtn" class="btn btnPrimary" type="button" style="width:100%">
            Agregar al carrito
          </button>

          <small class="muted" style="display:block;margin-top:10px">
            Entrega: selecciona Pickup / Local TJ / México / USA dentro del carrito.
          </small>
        </div>
      </div>
    `;
  }

  const qtyInput = $("#qtyInput");
  $("#qtyMinus")?.addEventListener("click", () => {
    const v = Math.max(1, (Number(qtyInput?.value) || 1) - 1);
    if (qtyInput) qtyInput.value = String(v);
  });
  $("#qtyPlus")?.addEventListener("click", () => {
    const v = Math.max(1, (Number(qtyInput?.value) || 1) + 1);
    if (qtyInput) qtyInput.value = String(v);
  });

  $("#addToCartBtn")?.addEventListener("click", () => {
    const size = String($("#sizeSelect")?.value || "");
    const qty = Math.max(1, Number($("#qtyInput")?.value || 1));
    addToCart({ sku: p.sku, size, qty });
    closeModal("#productModal");
    openDrawer();
  });

  openModal("#productModal");
}

// ---------- cart ----------
function saveCart() {
  try {
    localStorage.setItem("scorestore_cart_v1", JSON.stringify(STATE.cart));
  } catch {}
}

function loadCart() {
  try {
    const raw = localStorage.getItem("scorestore_cart_v1");
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) STATE.cart = arr;
  } catch {}
}

function setCartBadge() {
  const el = $("#cartCount");
  if (!el) return;
  el.textContent = String(sumCartQty());
}

function addToCart({ sku, size, qty }) {
  const q = Math.max(1, Number(qty) || 1);
  const s = String(size || "");

  const existing = STATE.cart.find((it) => it.sku === sku && String(it.size || "") === s);
  if (existing) {
    existing.qty = Math.max(1, (Number(existing.qty) || 1) + q);
  } else {
    STATE.cart.push({ sku, size: s, qty: q });
  }

  saveCart();
  setCartBadge();
  renderDrawer();
}

function removeFromCart(index) {
  STATE.cart.splice(index, 1);
  saveCart();
  setCartBadge();
  renderDrawer();
}

function updateCartQty(index, qty) {
  const q = Math.max(1, Number(qty) || 1);
  const it = STATE.cart[index];
  if (!it) return;
  it.qty = q;
  saveCart();
  setCartBadge();
  renderDrawer();
}

function renderDrawer() {
  const body = $("#drawerBody");
  if (!body) return;

  if (!STATE.cart.length) {
    body.innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">Tu carrito está vacío</div>
        <div class="emptySub">Agrega productos desde los catálogos.</div>
      </div>
    `;
    return;
  }

  const itemsHtml = STATE.cart
    .map((it, idx) => {
      const p = STATE.products.find((x) => x.sku === it.sku);
      if (!p) return "";
      const price = fmtMoney(fromCents(p.price_cents));
      return `
      <div class="cartItem">
        <img class="cartImg" src="${safeUrl(p.img)}" alt="${esc(p.name)}" loading="lazy" />
        <div class="cartInfo">
          <div class="cartName">${esc(p.name)}</div>
          <div class="cartMeta">${esc(it.size || "")}</div>
          <div class="cartPrice">${esc(price)}</div>

          <div class="cartRow">
            <div class="qtyRow">
              <button class="iconBtn" type="button" data-qtyminus="${idx}">−</button>
              <input class="input qtyInput" value="${esc(it.qty)}" inputmode="numeric" data-qtyinput="${idx}" />
              <button class="iconBtn" type="button" data-qtyplus="${idx}">+</button>
            </div>
            <button class="btn btnGhost" type="button" data-remove="${idx}">Quitar</button>
          </div>
        </div>
      </div>
      `;
    })
    .join("");

  const subtotalCents = sumCartSubtotalCents();
  const subtotal = fmtMoney(fromCents(subtotalCents));

  const shipMode = STATE.shipping.mode;
  const shipPostal = STATE.shipping.postal;
  const shipQuote = STATE.shipping.quote;
  const shipLoading = STATE.shipping.loading;

  const shipLine = shipQuote?.ok ? fmtMoney(fromCents(shipQuote.amount_cents || 0)) : fmtMoney(0);

  const promoLine =
    STATE.promoPreview?.ok && STATE.promoPreview?.discount_cents
      ? `-${fmtMoney(fromCents(STATE.promoPreview.discount_cents))}`
      : fmtMoney(0);

  const totalCents =
    subtotalCents +
    (shipQuote?.ok ? Number(shipQuote.amount_cents || 0) : 0) -
    (STATE.promoPreview?.ok ? Number(STATE.promoPreview.discount_cents || 0) : 0);

  const total = fmtMoney(fromCents(Math.max(0, totalCents)));

  body.innerHTML = `
    <div class="drawerSection">
      <div class="drawerLabel">Entrega</div>

      <div class="shipGrid">
        <label class="shipOption">
          <input type="radio" name="shipMode" value="pickup" ${shipMode === "pickup" ? "checked" : ""} />
          <div>
            <div class="shipTitle">Pickup</div>
            <div class="shipSub">Recoges directo en fábrica (Tijuana).</div>
          </div>
        </label>

        <label class="shipOption">
          <input type="radio" name="shipMode" value="local_tj" ${shipMode === "local_tj" ? "checked" : ""} />
          <div>
            <div class="shipTitle">Local TJ</div>
            <div class="shipSub">Uber/Didi (solo Tijuana; costo se coordina).</div>
          </div>
        </label>

        <label class="shipOption">
          <input type="radio" name="shipMode" value="envia_mx" ${shipMode === "envia_mx" ? "checked" : ""} />
          <div>
            <div class="shipTitle">México</div>
            <div class="shipSub">Cotización en tiempo real con Envia.com.</div>
          </div>
        </label>

        <label class="shipOption">
          <input type="radio" name="shipMode" value="envia_us" ${shipMode === "envia_us" ? "checked" : ""} />
          <div>
            <div class="shipTitle">USA</div>
            <div class="shipSub">Cotización en tiempo real con Envia.com.</div>
          </div>
        </label>
      </div>

      <div class="row" style="margin-top:10px">
        <label class="label">Código postal (solo México/USA)</label>
        <div style="display:flex;gap:10px">
          <input id="shipPostal" class="input" value="${esc(shipPostal)}" placeholder="Ej. 22000" inputmode="numeric" />
          <button id="shipQuoteBtn" class="btn" type="button" ${shipLoading ? "disabled" : ""}>
            ${shipLoading ? "Cotizando..." : "Cotizar"}
          </button>
        </div>
        <small class="muted" style="display:block;margin-top:6px">
          Si eliges Pickup o Local TJ, no necesitas cotizar aquí.
        </small>
      </div>
    </div>

    <div class="drawerSection">
      <div class="drawerLabel">Código promocional</div>
      <div style="display:flex;gap:10px">
        <input id="promoInput" class="input" value="${esc(STATE.promoCode || "")}" placeholder="Ej. BAJA10" />
        <button id="promoApplyBtn" class="btn" type="button">Aplicar</button>
      </div>
      <small class="muted" style="display:block;margin-top:6px">
        Se valida al pagar. Si no aplica, no se cobra descuento.
      </small>
    </div>

    <div class="drawerSection">
      ${itemsHtml}
    </div>

    <div class="drawerTotals">
      <div class="line"><span>Subtotal</span><strong>${esc(subtotal)}</strong></div>
      <div class="line"><span>Envío</span><strong>${esc(shipLine)}</strong></div>
      <div class="line"><span>Descuento</span><strong>${esc(promoLine)}</strong></div>
      <div class="line total"><span>Total</span><strong>${esc(total)}</strong></div>

      <button id="checkoutBtn" class="btn btnPrimary" type="button" style="width:100%">
        Pagar seguro
      </button>

      <small class="muted" style="display:block;margin-top:10px">
        En México/USA, la guía se cotiza en tiempo real. Para Local TJ se coordina por Uber/Didi.
      </small>
    </div>
  `;

  // bindings
  $$('input[name="shipMode"]').forEach((r) => {
    r.addEventListener("change", () => {
      STATE.shipping.mode = String(r.value);
      STATE.shipping.quote = null;
      renderDrawer();
    });
  });

  $("#shipPostal")?.addEventListener("input", (e) => {
    STATE.shipping.postal = String(e.target.value || "");
  });

  $("#shipQuoteBtn")?.addEventListener("click", async () => {
    await quoteShipping();
  });

  $("#promoInput")?.addEventListener("input", (e) => {
    STATE.promoCode = String(e.target.value || "");
  });

  $("#promoApplyBtn")?.addEventListener("click", async () => {
    await previewPromo();
    renderDrawer();
  });

  $$("[data-remove]").forEach((b) => {
    b.addEventListener("click", () => removeFromCart(Number(b.getAttribute("data-remove"))));
  });

  $$("[data-qtyminus]").forEach((b) => {
    b.addEventListener("click", () => {
      const idx = Number(b.getAttribute("data-qtyminus"));
      const it = STATE.cart[idx];
      if (!it) return;
      updateCartQty(idx, Math.max(1, (Number(it.qty) || 1) - 1));
    });
  });

  $$("[data-qtyplus]").forEach((b) => {
    b.addEventListener("click", () => {
      const idx = Number(b.getAttribute("data-qtyplus"));
      const it = STATE.cart[idx];
      if (!it) return;
      updateCartQty(idx, Math.max(1, (Number(it.qty) || 1) + 1));
    });
  });

  $$("[data-qtyinput]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = Number(inp.getAttribute("data-qtyinput"));
      updateCartQty(idx, Number(inp.value || 1));
    });
  });

  $("#checkoutBtn")?.addEventListener("click", async () => {
    await goCheckout();
  });
}

async function previewPromo() {
  // preview local (UX), la validación REAL sucede en backend al pagar.
  const code = String(STATE.promoCode || "").trim().toUpperCase();
  if (!code) {
    STATE.promoPreview = null;
    return;
  }

  try {
    if (!STATE.promos) STATE.promos = await getJSON(CONFIG.promosUrl);
    const rules = Array.isArray(STATE.promos?.rules)
      ? STATE.promos.rules
      : Array.isArray(STATE.promos?.promos)
      ? STATE.promos.promos
      : [];

    const rule = rules.find((r) => String(r?.code || "").trim().toUpperCase() === code && r?.active);
    if (!rule) {
      STATE.promoPreview = { ok: false };
      return;
    }

    const type = String(rule.type || "").toLowerCase();
    const subtotalCents = sumCartSubtotalCents();

    if (type === "percent") {
      const pct = Math.max(0, Math.min(1, Number(rule.value) || 0));
      const discount = Math.round(subtotalCents * pct);
      STATE.promoPreview = { ok: true, discount_cents: discount };
      return;
    }

    if (type === "fixed_mxn") {
      const mxn = Math.max(0, Number(rule.value) || 0);
      const discount = Math.min(subtotalCents, toCents(mxn));
      STATE.promoPreview = { ok: true, discount_cents: discount };
      return;
    }

    if (type === "free_shipping") {
      // lo aplicará backend, aquí solo marcamos ok
      STATE.promoPreview = { ok: true, discount_cents: 0 };
      return;
    }

    STATE.promoPreview = { ok: false };
  } catch (err) {
    console.error(err);
    STATE.promoPreview = { ok: false };
  }
}

async function quoteShipping() {
  const mode = STATE.shipping.mode;
  const postal = String(STATE.shipping.postal || "").trim();

  if (mode === "pickup" || mode === "local_tj") {
    STATE.shipping.quote = { ok: true, amount_cents: 0 };
    return;
  }

  if (!postal) {
    STATE.shipping.quote = { ok: false, error: "Código postal requerido." };
    return;
  }

  STATE.shipping.loading = true;
  renderDrawer();

  try {
    // Cotización real se hace en backend /api/checkout al pagar.
    // Aquí solo guardamos postal; para UI ponemos 0 hasta pagar.
    STATE.shipping.quote = { ok: true, amount_cents: 0 };
  } catch (err) {
    console.error(err);
    STATE.shipping.quote = { ok: false, error: "No se pudo cotizar." };
  } finally {
    STATE.shipping.loading = false;
    renderDrawer();
  }
}

async function goCheckout() {
  if (!STATE.cart.length) return;

  const items = STATE.cart.map((it) => ({
    sku: it.sku,
    qty: it.qty,
    size: it.size || "",
    name: STATE.products.find((p) => p.sku === it.sku)?.name || "",
  }));

  const payload = {
    items,
    items_qty: sumCartQty(),
    shipping_mode: STATE.shipping.mode,
    postal_code: String(STATE.shipping.postal || "").trim(),
    promo_code: String(STATE.promoCode || "").trim().toUpperCase(),
  };

  try {
    const res = await fetch(CONFIG.checkoutUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.url) {
      alert(data?.error || "No se pudo iniciar el pago.");
      return;
    }

    window.location.href = data.url;
  } catch (err) {
    console.error(err);
    alert("Error iniciando el pago.");
  }
}

// ---------- AI ----------
function renderAi() {
  const box = $("#aiMessages");
  if (!box) return;

  box.innerHTML = STATE.ai.messages
    .map((m) => {
      const cls = m.role === "user" ? "aiMsg user" : "aiMsg bot";
      return `<div class="${cls}">${esc(m.text)}</div>`;
    })
    .join("");
}

function openAi() {
  STATE.ai.open = true;
  openModal("#aiModal");
  renderAi();
}

function closeAi() {
  STATE.ai.open = false;
  closeModal("#aiModal");
}

async function aiSend() {
  const input = $("#aiInput");
  const text = String(input?.value || "").trim();
  if (!text) return;

  STATE.ai.messages.push({ role: "user", text });
  if (input) input.value = "";
  renderAi();

  try {
    const res = await fetch(CONFIG.aiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      STATE.ai.messages.push({ role: "bot", text: data?.error || "No pude responder en este momento." });
      renderAi();
      return;
    }

    const reply = String(data?.reply || data?.text || data?.message || "Listo.");
    STATE.ai.messages.push({ role: "bot", text: reply });
    renderAi();
  } catch (err) {
    console.error(err);
    STATE.ai.messages.push({ role: "bot", text: "Error conectando con Score AI." });
    renderAi();
  }
}

// ---------- legal ----------
async function openLegal() {
  try {
    if (!STATE.legal) STATE.legal = await getJSON(CONFIG.legalUrl);
    const body = $("#legalBody");
    if (body) body.innerHTML = String(STATE.legal?.html || STATE.legal?.text || "");
    openModal("#legalModal");
  } catch (err) {
    console.error(err);
    const body = $("#legalBody");
    if (body) body.innerHTML = `<div class="muted">No se pudo cargar Legal.</div>`;
    openModal("#legalModal");
  }
}

// ---------- init ----------
async function init() {
  try {
    STATE.catalog = await getJSON(CONFIG.catalogUrl);

    // Normalizamos para evitar “catálogo no aparece”
    const secs = Array.isArray(STATE.catalog?.sections) ? STATE.catalog.sections : [];
    const prods = Array.isArray(STATE.catalog?.products) ? STATE.catalog.products : [];

    STATE.sections = secs.map((s) => ({
      id: s.id,
      name: s.name || s.title || s.id,
      subtitle: s.subtitle || "",
      meta: s.meta || "",
      cover: s.cover || "/assets/hero.webp",
      logo: s.logo || "/assets/logo-score.webp",
      active: s.active !== false,
    }));

    STATE.products = prods.map((p) => ({
      ...p,
      sku: p.sku || p.id,
      sectionId: p.sectionId || p.section_id || "",
      price_cents:
        Number.isFinite(p.price_cents) ? p.price_cents : Number.isFinite(p.baseMXN) ? toCents(p.baseMXN) : 0,
      img: p.img || (Array.isArray(p.images) ? p.images[0] : ""),
      images: Array.isArray(p.images) ? p.images : p.img ? [p.img] : [],
    }));

    loadCart();
    setCartBadge();

    renderEditionGrid();

    // events
    $("#openCartBtn")?.addEventListener("click", () => {
      renderDrawer();
      openDrawer();
    });
    $("#heroOpenCart")?.addEventListener("click", () => {
      renderDrawer();
      openDrawer();
    });

    $("#closeCartBtn")?.addEventListener("click", closeDrawer);

    $("#openAiBtn")?.addEventListener("click", openAi);
    $("#openAiBtnFab")?.addEventListener("click", openAi);
    $("#footerAiBtn")?.addEventListener("click", openAi);
    $("#heroCtaAi")?.addEventListener("click", openAi);

    $("#closeAiBtn")?.addEventListener("click", closeAi);

    $("#openLegalBtn")?.addEventListener("click", openLegal);
    $("#closeLegalBtn")?.addEventListener("click", () => closeModal("#legalModal"));

    $("#closeProductBtn")?.addEventListener("click", () => closeModal("#productModal"));

    $("#pageOverlay")?.addEventListener("click", () => {
      closeDrawer();
      closeAi();
      closeModal("#legalModal");
      closeModal("#productModal");
    });

    $("#aiSendBtn")?.addEventListener("click", aiSend);
    $("#aiInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") aiSend();
    });

    bindCookieButtons();
    showCookieBannerIfNeeded();

    // deep link edition
    const url = new URL(window.location.href);
    const edition = url.searchParams.get("edition");
    if (edition) {
      const exists = STATE.sections.some((s) => s.id === edition);
      if (exists) openSection(edition);
    }
  } catch (err) {
    console.error(err);
    const grid = $("#editionGrid");
    if (grid) grid.innerHTML = `<div class="heroCard" style="padding:14px">Error cargando catálogo.</div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
