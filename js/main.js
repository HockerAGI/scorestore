/* SCORE STORE LOGIC — DARK RACING PRO v4.0 */
(function () {
  "use strict";
  const API_BASE = (location.hostname === "localhost") ? "/api" : "/.netlify/functions";
  const CART_KEY = "score_cart_dark_v1";
  
  // LOGICA COMERCIAL
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 4.5;
  const FALLBACK_COST_MX = 250;
  const FALLBACK_COST_US = 800;

  let cart = [];
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };
  let catalogData = { products: [] };
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  
  // Splash Logic
  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hide")) {
      s.classList.add("hide");
      setTimeout(() => { try { s.remove(); } catch {} }, 600);
    }
  }

  async function init() {
    setTimeout(hideSplash, 3500); // Intro cinemática
    await loadCatalog();
    loadCart();
    setupUI();
    updateCartUI();
    hideSplash();
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch { catalogData = { products: [] }; }
  }

  window.openCatalog = (sectionId) => {
    // Aquí implementa la lógica de abrir tu modal con la data cargada
    // Simular alerta por ahora para brevedad del código, debes usar tu modal HTML
    alert("Abriendo catálogo: " + sectionId + " (Implementar render completo aquí)");
  };

  window.addToCart = (id) => {
    // Lógica añadir
    window.toast("Agregado al Carrito");
    window.openDrawer();
  };

  // UI Setup
  function setupUI() {
    document.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", (e) => {
        const m = e.target.value;
        shippingState.mode = m;
        const form = $("shipForm");
        form.style.display = (m === "pickup") ? "none" : "block";
        
        if (m === "pickup") shippingState.cost = 0;
        else if (m === "tj") shippingState.cost = 200;
        else shippingState.cost = (m === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US; // Fallback simple por ahora
        
        updateCartUI();
      });
    });
  }

  function updateCartUI() {
    // Renderizado simple
    $("cartCount").innerText = cart.length;
    $("grandTotal").innerText = money(shippingState.cost); // + Subtotal real
  }

  window.toast = (msg) => { const t = $("toast"); t.innerText = msg; t.style.transform = "translateX(0)"; setTimeout(()=>t.style.transform="translateX(200%)", 3000); };
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll(".drawer, .active").forEach(e => e.classList.remove("active")); };
  window.scrollToId = (id) => document.getElementById(id).scrollIntoView({behavior:'smooth'});

  function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) try{cart=JSON.parse(s)}catch{} }
  
  document.addEventListener("DOMContentLoaded", init);
})();
