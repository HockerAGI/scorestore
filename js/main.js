/* ======================================================
   SCORE STORE — main.js (Netlify + Stripe)
   ====================================================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n || 0).toLocaleString("es-MX")} MXN`;
const digitsOnly = (v) => (v ?? "").toString().replace(/\D+/g, "");

const LS_KEY = "score_cart";
let CART = safeParse(localStorage.getItem(LS_KEY), []);
let CATALOG = null;
let PROMOS = null;

let promoState = { code: "", discountMXN: 0, ok: false, msg: "" };
let shipState = { mode: "pickup", mxn: 0, label: "Pickup (Tijuana)", ok: true, quoted: true };

function safeParse(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function saveCart() {
  localStorage.setItem(LS_KEY, JSON.stringify(CART));
}

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
    el.hidden = true;
  }, 2200);
}

function setCartCount() {
  const n = CART.reduce((s, i) => s + (i.qty || 0), 0);
  $("cartCount").textContent = String(n);
}

function subtotalMXN() {
  return CART.reduce((s, i) => s + (Number(i.price || 0) * Number(i.qty || 0)), 0);
}

function computePromoPreview(sub, ship) {
  const code = (promoState.code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { ok: false, discountMXN: 0, msg: "" };

  const rules = Array.isArray(PROMOS?.rules) ? PROMOS.rules : [];
  const rule = rules.find((r) => (r.code || "").toUpperCase() === code && r.active);
  if (!rule) return { ok: false, discountMXN: 0, msg: "Cupón no válido." };

  let discount = 0;
  if (rule.type === "percent") discount = Math.round(sub * Number(rule.value || 0));
  else if (rule.type === "fixed_mxn") discount = Math.round(Number(rule.value || 0));
  else if (rule.type === "free_shipping") discount = Math.round(ship);

  const total = Math.max(0, sub + ship - discount);
  discount = Math.min(discount, sub + ship);

  return { ok: true, discountMXN: discount, msg: `Cupón aplicado (preview). Total aprox: ${money(total)}` };
}

function setTotalsUI() {
  const sub = subtotalMXN();
  const ship = shipState.mxn || 0;

  // promo preview (solo UI)
  const p = computePromoPreview(sub, ship);
  promoState.discountMXN = p.discountMXN;
  promoState.ok = p.ok;
  $("promoMsg").textContent = p.msg || "";

  const disc = promoState.discountMXN || 0;
  const total = Math.max(0, sub + ship - disc);

  $("lnSub").textContent = money(sub);
  $("lnShip").textContent = money(ship);
  $("lnDisc").textContent = money(disc);
  $("lnTotal").textContent = money(total);

  $("barTotal").textContent = money(total);

  // Pay enable rules
  const canPay = canProceedToPay();
  $("payBtn").disabled = !canPay;
  $("payBtn2").disabled = !canPay;

  // paybar
  const paybar = $("paybar");
  if (!paybar) return;
  if (CART.length > 0) paybar.hidden = false;
  else paybar.hidden = true;
}

function normalizeShipMode(v) {
  const m = (v || "").toString().toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "tj") return "tj";
  if (m === "mx") return "mx";
  return "pickup";
}

function readAddress() {
  return {
    postal_code: digitsOnly($("cp").value),
    state_code: ($("state").value || "").trim().toUpperCase(),
    city: ($("city").value || "").trim(),
    address1: ($("addr").value || "").trim(),
    name: ($("shipName").value || "").trim()
  };
}

function requireAddressForMode(mode) {
  const to = readAddress();
  if (mode === "pickup") return { ok: true, to };

  if (!to.name) return { ok: false, error: "Falta nombre para entrega.", to };
  if (!to.address1) return { ok: false, error: "Falta dirección.", to };

  // Para envío nacional pedimos completo
  if (mode === "mx") {
    if (!to.postal_code || to.postal_code.length !== 5) return { ok: false, error: "CP inválido (5 dígitos).", to };
    if (!to.state_code) return { ok: false, error: "Falta estado (ej. BC).", to };
    if (!to.city) return { ok: false, error: "Falta ciudad.", to };
  }

  return { ok: true, to };
}

function canProceedToPay() {
  if (CART.length === 0) return false;

  const mode = shipState.mode;
  const v = requireAddressForMode(mode);
  if (!v.ok) return false;

  // En nacional, exige cotización OK
  if (mode === "mx" && !shipState.quoted) return false;

  return true;
}

function sanitizeItemsForAPI() {
  return CART.map((i) => ({
    id: i.id,
    qty: Number(i.qty || 0),
    size: i.size || ""
  })).filter((x) => x.id && x.qty > 0);
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  return j;
}

async function quoteShipping() {
  const mode = shipState.mode;
  if (mode === "pickup") {
    shipState = { mode, mxn: 0, label: "Pickup (Tijuana)", ok: true, quoted: true };
    $("quoteResult").textContent = "Pickup gratis.";
    setTotalsUI();
    return;
  }

  const v = requireAddressForMode(mode);
  if (!v.ok) {
    $("quoteResult").textContent = v.error;
    shipState.quoted = false;
    setTotalsUI();
    return;
  }

  $("quoteResult").textContent = "Cotizando…";

  const payload = {
    mode, // pickup | tj | mx
    to: v.to,
    items: sanitizeItemsForAPI()
  };

  try {
    const data = await fetchJSON("/.netlify/functions/quote_shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!data?.ok) throw new Error(data?.error || "No se pudo cotizar.");

    shipState = {
      mode,
      mxn: Number(data.mxn || 0),
      label: `${data.carrier || "ENVÍO"} ${data.service || ""}`.trim(),
      ok: true,
      quoted: true
    };

    $("quoteResult").textContent = `Envío: ${money(shipState.mxn)} — ${shipState.label}`;
    setTotalsUI();
  } catch (e) {
    shipState = { mode, mxn: 0, label: "No cotizado", ok: false, quoted: false };
    $("quoteResult").textContent = `No se pudo cotizar: ${(e?.message || "").slice(0, 120)}`;
    setTotalsUI();
  }
}

async function checkout() {
  const mode = shipState.mode;
  const v = requireAddressForMode(mode);
  if (!v.ok) {
    toast(v.error);
    return;
  }

  const payload = {
    items: sanitizeItemsForAPI(),
    mode,
    promoCode: ($("promoInput").value || "").trim(),
    to: v.to
  };

  try {
    const data = await fetchJSON("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (data?.url) window.location.href = data.url;
    else toast(data?.error || "Error iniciando pago.");
  } catch (e) {
    toast(e?.message || "Error iniciando pago.");
  }
}

function openCart() {
  $("overlay").hidden = false;
  $("cartDrawer").hidden = false;
  document.body.classList.add("modalOpen");
}

function closeCart() {
  $("overlay").hidden = true;
  $("cartDrawer").hidden = true;
  document.body.classList.remove("modalOpen");
}

function renderCart() {
  const wrap = $("cartBody");
  wrap.innerHTML = "";

  if (CART.length === 0) {
    wrap.innerHTML = `<p class="empty">Tu carrito está vacío.</p>`;
    setCartCount();
    setTotalsUI();
    return;
  }

  for (const it of CART) {
    const row = document.createElement("div");
    row.className = "cartItem";

    row.innerHTML = `
      <img src="${it.img}" alt="${escapeHTML(it.name)}" width="64" height="64" decoding="async" />
      <div class="cartMeta">
        <div class="cartName">${escapeHTML(it.name)}</div>
        <div class="cartSub">${escapeHTML(it.size || "")}</div>
        <div class="cartPrice">${money(it.price)}</div>
        <div class="qtyRow">
          <button class="qtyBtn" data-act="dec" data-id="${it.id}">−</button>
          <span class="qtyNum">${it.qty}</span>
          <button class="qtyBtn" data-act="inc" data-id="${it.id}">+</button>
          <button class="rmBtn" data-act="rm" data-id="${it.id}">Quitar</button>
        </div>
      </div>
    `;

    wrap.appendChild(row);
  }

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    if (!act || !id) return;

    const i = CART.find((x) => x.id === id);
    if (!i) return;

    if (act === "inc") i.qty += 1;
    if (act === "dec") i.qty = Math.max(1, i.qty - 1);
    if (act === "rm") CART = CART.filter((x) => x.id !== id);

    saveCart();
    setCartCount();
    renderCart();
    setTotalsUI();
  }, { once: true });

  setCartCount();
  setTotalsUI();
}

function escapeHTML(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderCatalog() {
  const grid = $("catalogGrid");
  grid.innerHTML = "";

  const sections = Array.isArray(CATALOG?.sections) ? [...CATALOG.sections] : [];
  sections.sort((a, b) => (a.order || 0) - (b.order || 0));

  const products = Array.isArray(CATALOG?.products) ? CATALOG.products : [];

  for (const sec of sections) {
    const block = document.createElement("section");
    block.className = "catSection";

    block.innerHTML = `
      <div class="secHead">
        <h3>${escapeHTML(sec.title || sec.id)}</h3>
        ${sec.badge ? `<span class="badge">${escapeHTML(sec.badge)}</span>` : ""}
      </div>
      <div class="secGrid"></div>
    `;

    const secGrid = block.querySelector(".secGrid");
    const items = products.filter((p) => p.sectionId === sec.id);

    for (const p of items) {
      const card = document.createElement("article");
      card.className = "prodCard";

      const sizes = Array.isArray(p.sizes) ? p.sizes : [];
      const defaultSize = sizes[0] || "";

      card.innerHTML = `
        <img src="${p.img}" alt="${escapeHTML(p.name)}" loading="lazy" decoding="async" />
        <div class="prodName">${escapeHTML(p.name)}</div>
        <div class="prodPrice">${money(p.baseMXN)}</div>
        ${sizes.length ? `
          <select class="select sizeSel">
            ${sizes.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("")}
          </select>
        ` : `<div class="hint">Unitalla</div>`}
        <button class="btnPrimary addBtn" type="button">Agregar</button>
      `;

      card.querySelector(".addBtn").addEventListener("click", () => {
        const sel = card.querySelector(".sizeSel");
        const size = sel ? sel.value : defaultSize;

        const found = CART.find((x) => x.id === p.id && (x.size || "") === (size || ""));
        if (found) found.qty += 1;
        else CART.push({
          id: p.id,
          name: p.name,
          img: p.img,
          size: size || "",
          price: Number(p.baseMXN || 0),
          qty: 1
        });

        saveCart();
        setCartCount();
        setTotalsUI();
        toast("Agregado al carrito.");
      });

      secGrid.appendChild(card);
    }

    grid.appendChild(block);
  }
}

async function init() {
  // UI events
  $("openCartHero").addEventListener("click", openCart);
  $("closeCart").addEventListener("click", closeCart);
  $("overlay").addEventListener("click", closeCart);

  $("payBtn").addEventListener("click", checkout);
  $("payBtn2").addEventListener("click", checkout);

  $("applyPromoBtn").addEventListener("click", () => {
    promoState.code = ($("promoInput").value || "").trim();
    setTotalsUI();
  });

  $("shipMethod").addEventListener("change", async (e) => {
    const mode = normalizeShipMode(e.target.value);
    shipState.mode = mode;

    // UI show/hide form
    const showForm = mode !== "pickup";
    $("shipForm").hidden = !showForm;

    if (mode === "pickup") {
      shipState = { mode, mxn: 0, label: "Pickup (Tijuana)", ok: true, quoted: true };
      $("quoteResult").textContent = "Pickup gratis.";
      setTotalsUI();
      return;
    }

    if (mode === "tj") {
      shipState = { mode, mxn: 200, label: "Entrega local Tijuana", ok: true, quoted: true };
      $("quoteResult").textContent = `Entrega local: ${money(200)} (24–48h aprox)`;
      setTotalsUI();
      return;
    }

    // mx: requiere cotizar
    shipState = { mode, mxn: 0, label: "No cotizado", ok: false, quoted: false };
    $("quoteResult").textContent = "Completa tu dirección y cotiza envío.";
    setTotalsUI();
  });

  $("quoteBtn").addEventListener("click", quoteShipping);

  // Load data
  CATALOG = await fetchJSON("/data/catalog.json", { cache: "no-store" });
  PROMOS = await fetchJSON("/data/promos.json", { cache: "no-store" });

  renderCatalog();
  renderCart();
  setTotalsUI();
  setCartCount();
}

init().catch(() => {
  toast("Error cargando catálogo.");
});