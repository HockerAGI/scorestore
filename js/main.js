/* =========================================================
   SCORE STORE — MAIN JS (PRODUCCIÓN)
   Compatible con index final + styles.css
========================================================= */

(() => {
  "use strict";

  /* ------------------ HELPERS ------------------ */
  const $ = (q, ctx = document) => ctx.querySelector(q);
  const $$ = (q, ctx = document) => Array.from(ctx.querySelectorAll(q));

  const moneyMXN = (n) =>
    `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  /* ------------------ STATE ------------------ */
  const state = {
    cart: [],
    catalog: {},
    currentCategory: null,
    shipping: {
      method: "",
      price: 0,
    },
  };

  /* ------------------ ELEMENTS ------------------ */
  const overlay = $(".overlay");
  const modal = $("#modalCatalog");
  const catTitle = $("#catTitle");
  const catContent = $("#catContent");

  const drawer = $("#drawer");
  const cartBody = $("#cartBody");
  const lnTotal = $("#lnTotal");
  const cartCount = $(".cartCount");
  const payBtn = $("#payBtn");

  /* ------------------ INIT ------------------ */
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindGlobal();
    bindCards();
    bindCartTriggers();
    loadCatalog();
    updateCartUI();
  }

  /* ------------------ BINDINGS ------------------ */

  function bindGlobal() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });

    overlay?.addEventListener("click", closeAll);
  }

  function bindCards() {
    $$(".card").forEach((card) => {
      const cat = card.dataset.category;
      if (!cat) return;

      card.addEventListener("click", () => openCatalog(cat));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openCatalog(cat);
      });
    });
  }

  function bindCartTriggers() {
    $$(".cartTrigger").forEach((btn) => {
      btn.addEventListener("click", openDrawer);
    });
  }

  /* ------------------ CATALOG ------------------ */

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar catálogo");
      state.catalog = await res.json();
    } catch (e) {
      console.error("Catalog error:", e.message);
      state.catalog = {};
    }
  }

  function openCatalog(category) {
    state.currentCategory = category;
    const items = state.catalog?.[category] || [];

    catTitle.textContent = category.replace(/_/g, " ");
    catContent.innerHTML = "";

    if (!items.length) {
      catContent.innerHTML =
        "<p style='padding:20px; text-align:center;'>Catálogo no disponible.</p>";
    } else {
      const grid = document.createElement("div");
      grid.className = "catGrid";

      items.forEach((p) => {
        const card = document.createElement("div");
        card.className = "prodCard";

        card.innerHTML = `
          <img src="${p.image}" alt="${p.name}" loading="lazy">
          <strong>${p.name}</strong>
          <span>${moneyMXN(p.price)}</span>
          <button class="btn-sm" type="button">Agregar</button>
        `;

        $("button", card).addEventListener("click", () => {
          addToCart(p);
        });

        grid.appendChild(card);
      });

      catContent.appendChild(grid);
    }

    openModal();
  }

  /* ------------------ CART ------------------ */

  function addToCart(product) {
    const found = state.cart.find((i) => i.id === product.id);
    if (found) {
      found.qty = clamp(found.qty + 1, 1, 99);
    } else {
      state.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty: 1,
      });
    }
    toast("Producto agregado");
    updateCartUI();
  }

  function updateCartUI() {
    cartBody.innerHTML = "";

    let total = 0;
    let count = 0;

    state.cart.forEach((i, idx) => {
      total += i.price * i.qty;
      count += i.qty;

      const row = document.createElement("div");
      row.className = "sumRow";

      row.innerHTML = `
        <span>${i.qty}× ${i.name}</span>
        <span>${moneyMXN(i.price * i.qty)}</span>
      `;

      cartBody.appendChild(row);
    });

    lnTotal.textContent = moneyMXN(total);
    cartCount.textContent = count;
    payBtn.disabled = total <= 0;
  }

  /* ------------------ CHECKOUT ------------------ */

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
    } catch (e) {
      console.error(e);
      toast("Error al iniciar pago");
      payBtn.disabled = false;
    }
  }

  payBtn?.addEventListener("click", checkout);

  /* ------------------ UI OPEN/CLOSE ------------------ */

  function openModal() {
    modal?.classList.add("active");
    overlay?.classList.add("active");
    modal?.setAttribute("aria-hidden", "false");
  }

  function openDrawer() {
    drawer?.classList.add("active");
    overlay?.classList.add("active");
    drawer?.setAttribute("aria-hidden", "false");
  }

  function closeAll() {
    modal?.classList.remove("active");
    drawer?.classList.remove("active");
    overlay?.classList.remove("active");
    modal?.setAttribute("aria-hidden", "true");
    drawer?.setAttribute("aria-hidden", "true");
  }

  $$(".closeBtn").forEach((b) => b.addEventListener("click", closeAll));

  /* ------------------ TOAST ------------------ */

  const toastEl = $("#toast");
  let toastT = null;

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 2000);
  }
})();