/* =========================================================
   SCORE STORE — MAIN JS (PRO CATALOG)
   - SubSections
   - Badge dinámico
   - Performance optimizado
========================================================= */
(() => {
  "use strict";

  /* ---------- HELPERS ---------- */
  const $ = (q, ctx = document) => ctx.querySelector(q);
  const $$ = (q, ctx = document) => Array.from(ctx.querySelectorAll(q));

  const money = (n) =>
    `$${Number(n || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
    })} MXN`;

  /* ---------- STATE ---------- */
  const state = {
    sections: [],
    products: [],
    cart: [],
  };

  /* ---------- ELEMENTS ---------- */
  const overlay = $("#overlay");
  const modal = $("#modalCatalog");
  const catTitle = $("#catTitle");
  const catContent = $("#catContent");

  const drawer = $("#drawer");
  const cartBody = $("#cartBody");
  const lnTotal = $("#lnTotal");
  const cartCount = $(".cartCount");
  const payBtn = $("#payBtn");
  const toastEl = $("#toast");

  /* ---------- INIT ---------- */
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindGlobal();
    bindCards();
    await loadCatalog();
    updateCartUI();
  }

  /* ---------- GLOBAL ---------- */
  function bindGlobal() {
    overlay?.addEventListener("click", closeAll);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });

    $$(".closeBtn").forEach((b) =>
      b.addEventListener("click", closeAll)
    );
  }

  /* ---------- LOAD CATALOG ---------- */
  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json", { cache: "no-store" });
      const data = await res.json();
      state.sections = data.sections || [];
      state.products = data.products || [];
    } catch (e) {
      console.error("Error cargando catálogo:", e);
    }
  }

  /* ---------- HOME CARDS ---------- */
  function bindCards() {
    $$(".card").forEach((card) => {
      const m = card.getAttribute("onclick")?.match(/'(.*?)'/);
      if (!m) return;
      const sectionId = m[1];
      card.onclick = () => openCatalog(sectionId);
      card.onkeydown = (e) => {
        if (e.key === "Enter") openCatalog(sectionId);
      };
    });
  }

  /* ---------- OPEN CATALOG ---------- */
  function openCatalog(sectionId) {
    const section = state.sections.find((s) => s.id === sectionId);
    const items = state.products.filter(
      (p) => p.sectionId === sectionId
    );

    catTitle.innerHTML = `
      ${section?.title || "CATÁLOGO"}
      ${section?.badge ? `<span class="statusBadge" style="margin-left:10px;">${section.badge}</span>` : ""}
    `;

    catContent.innerHTML = "";

    if (!items.length) {
      catContent.innerHTML =
        "<p style='text-align:center;padding:30px;'>Sin productos disponibles</p>";
      openModal();
      return;
    }

    /* ---- AGRUPAR POR SUBSECTION ---- */
    const groups = {};
    items.forEach((p) => {
      const key = p.subSection || "OTROS";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    /* ---- RENDER INCREMENTAL (PERFORMANCE) ---- */
    const frag = document.createDocumentFragment();

    Object.keys(groups).forEach((sub) => {
      const title = document.createElement("h4");
      title.className = "catSectionTitle";
      title.textContent = sub;
      frag.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "catGrid";

      groups[sub].forEach((p) => {
        const card = document.createElement("div");
        card.className = "prodCard";

        card.innerHTML = `
          <img src="${p.img}" alt="${p.name}" loading="lazy">
          <strong>${p.name}</strong>
          <span>${money(p.baseMXN)}</span>

          ${
            p.sizes?.length
              ? `<select class="sizeSel">
                  ${p.sizes
                    .map((s) => `<option value="${s}">${s}</option>`)
                    .join("")}
                </select>`
              : ""
          }

          <button class="btn-sm">Agregar</button>
        `;

        const sizeSel = card.querySelector(".sizeSel");
        card.querySelector("button").onclick = () =>
          addToCart(p, sizeSel?.value || null);

        grid.appendChild(card);
      });

      frag.appendChild(grid);
    });

    catContent.appendChild(frag);
    openModal();
  }

  /* ---------- CART ---------- */
  function addToCart(product, size) {
    const key = `${product.id}_${size || "NA"}`;
    const found = state.cart.find((i) => i.key === key);

    if (found) found.qty += 1;
    else
      state.cart.push({
        key,
        id: product.id,
        name: product.name,
        size,
        price: product.baseMXN,
        qty: 1,
      });

    toast("Producto agregado");
    updateCartUI();
  }

  function updateCartUI() {
    cartBody.innerHTML = "";
    let total = 0;
    let count = 0;

    state.cart.forEach((i) => {
      total += i.price * i.qty;
      count += i.qty;

      const row = document.createElement("div");
      row.className = "sumRow";
      row.innerHTML = `
        <span>${i.qty}× ${i.name}${i.size ? ` (${i.size})` : ""}</span>
        <span>${money(i.price * i.qty)}</span>
      `;
      cartBody.appendChild(row);
    });

    lnTotal.textContent = money(total);
    cartCount.textContent = count;
    payBtn.disabled = total <= 0;
  }

  /* ---------- CHECKOUT ---------- */
  async function checkout() {
    if (!state.cart.length) return;

    try {
      payBtn.disabled = true;

      const res = await fetch("/.netlify/functions/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.cart }),
      });

      const data = await res.json();
      if (!data?.url) throw new Error("Checkout inválido");
      window.location.href = data.url;
    } catch {
      toast("Error al iniciar pago");
      payBtn.disabled = false;
    }
  }

  payBtn?.addEventListener("click", checkout);

  /* ---------- UI ---------- */
  function openModal() {
    modal.classList.add("active");
    overlay.classList.add("active");
  }

  function openDrawer() {
    drawer.classList.add("active");
    overlay.classList.add("active");
  }

  function closeAll() {
    modal.classList.remove("active");
    drawer.classList.remove("active");
    overlay.classList.remove("active");
  }

  /* ---------- TOAST ---------- */
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  /* ---------- EXPORTS (HTML INLINE) ---------- */
  window.openDrawer = openDrawer;
  window.closeAll = closeAll;
})();