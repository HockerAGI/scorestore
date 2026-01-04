const API_BASE = "/.netlify/functions";
const CART_KEY = "score_cart_v2_prod";

// Estado Global
let state = {
  cart: [],
  catalog: {},
  shipping: { mode: "pickup", cost: 0, label: "Gratis" }
};

// Accesos directos al DOM (Tus IDs)
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/* ================= INIT ================= */
async function init() {
  // 1. Cargar Carrito
  const saved = localStorage.getItem(CART_KEY);
  if (saved) state.cart = JSON.parse(saved);

  // 2. Cargar Catálogo
  await loadCatalog();
  
  // 3. Restaurar UI
  updateCartUI();
  setupListeners();
}

async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json");
    const data = await res.json();
    data.products.forEach(p => state.catalog[p.id] = p);
    // Nota: Aquí podrías llamar una función para renderizar el catálogo en el home si no es estático
  } catch (e) {
    console.error("Error cargando catálogo:", e);
  }
}

/* ================= EVENT LISTENERS ================= */
function setupListeners() {
  // Detectar cambios en Radio Buttons de Envío
  const radios = document.getElementsByName("shipMode");
  radios.forEach(r => {
    r.addEventListener("change", (e) => handleShippingChange(e.target.value));
  });

  // Detectar CP para cotizar (Solo modo MX)
  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      if (e.target.value.length === 5 && state.shipping.mode === "mx") {
        quoteShipping(e.target.value);
      }
    });
  }
}

/* ================= CART LOGIC ================= */
function updateCartUI() {
  const container = $("cartItems");
  const countBadge = $("cartCount");
  const subTotalEl = $("subTotal");
  const grandTotalEl = $("grandTotal");
  const shipTotalEl = $("shipTotal");
  const emptyMsg = $("cartEmpty");

  // Limpiar
  container.innerHTML = "";
  let subtotal = 0;
  let totalItems = 0;

  if (state.cart.length === 0) {
    emptyMsg.style.display = "block";
    if(countBadge) countBadge.innerText = "0";
    if(subTotalEl) subTotalEl.innerText = "$0.00";
    if(grandTotalEl) grandTotalEl.innerText = "$0.00";
    return;
  }

  emptyMsg.style.display = "none";

  // Render Items
  state.cart.forEach((item, idx) => {
    const p = state.catalog[item.id];
    if (!p) return;

    const total = p.baseMXN * item.qty;
    subtotal += total;
    totalItems += item.qty;

    container.innerHTML += `
      <div class="cartItem" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
        <img src="${p.img}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;">
        <div style="flex:1;">
          <h4 style="font-size:14px; margin:0 0 4px;">${p.name}</h4>
          <p style="font-size:12px; color:#666; margin:0;">Talla: ${item.size} | Cant: ${item.qty}</p>
          <div style="font-weight:bold; font-size:14px;">${money(total)}</div>
        </div>
        <button onclick="removeFromCart(${idx})" style="border:none; background:transparent; color:#999; font-size:20px; cursor:pointer;">&times;</button>
      </div>
    `;
  });

  // Actualizar Totales
  if(countBadge) countBadge.innerText = totalItems;
  if(subTotalEl) subTotalEl.innerText = money(subtotal);
  if(shipTotalEl) shipTotalEl.innerText = state.shipping.label;
  
  // Gran Total
  const granTotal = subtotal + (state.shipping.cost || 0);
  if(grandTotalEl) grandTotalEl.innerText = money(granTotal);
}

/* ================= SHIPPING LOGIC ================= */
function handleShippingChange(mode) {
  state.shipping.mode = mode;
  const form = $("shipForm");
  
  // Lógica de visualización de formulario y costos base
  if (mode === "pickup") {
    form.style.display = "none";
    state.shipping.cost = 0;
    state.shipping.label = "Gratis (Fábrica)";
  } else if (mode === "tj") {
    form.style.display = "block"; // Necesitamos dirección para el chofer local
    state.shipping.cost = 200;
    state.shipping.label = "$200.00 (Local)";
  } else if (mode === "mx") {
    form.style.display = "block"; // Necesitamos dirección completa
    state.shipping.cost = 0; // Pendiente de cotizar
    state.shipping.label = "Cotizando...";
    
    // Si ya hay CP escrito, cotizar de inmediato
    const cp = $("cp").value;
    if (cp.length === 5) quoteShipping(cp);
    else state.shipping.label = "Ingresa CP";
  }
  updateCartUI();
}

async function quoteShipping(zip) {
  const shipLabel = $("shipTotal");
  if(shipLabel) shipLabel.innerText = "Calculando...";

  try {
    // Calculamos cantidad de items para estimar peso
    const totalQty = state.cart.reduce((sum, i) => sum + i.qty, 0);

    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      body: JSON.stringify({ zip, items: totalQty })
    });
    
    const data = await res.json();
    
    if (data.cost) {
      state.shipping.cost = data.cost;
      state.shipping.label = money(data.cost) + " (Nacional)";
    } else {
      state.shipping.cost = 250; // Fallback
      state.shipping.label = "$250.00 (Estándar)";
    }
  } catch (e) {
    console.error(e);
    state.shipping.cost = 250; 
    state.shipping.label = "$250.00 (Estándar)";
  }
  updateCartUI();
}

/* ================= ACTIONS ================= */
window.addToCart = (id) => {
  // Asumimos que hay un select de talla con ID "size-{id}" si estás en el catálogo
  // Si estás agregando desde modales, ajusta el selector
  /* Lógica simplificada para ejemplo, adaptar a tu render de catálogo */
  alert("Implementar lógica de botón AGREGAR según tu render de catálogo");
};

window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.querySelectorAll(".modal").forEach(e => e.classList.remove("active")); // Cierra modales también
  // Restaurar scroll si estaba bloqueado
  document.body.style.overflow = "";
};

window.openLegal = (section) => {
  $("legalModal").classList.add("active");
  $("overlay").classList.add("active");
  // Ocultar todos los bloques y mostrar el seleccionado
  document.querySelectorAll(".legalBlock").forEach(b => b.style.display = "none");
  const block = document.querySelector(`.legalBlock[data-legal-block="${section}"]`);
  if(block) block.style.display = "block";
};

/* ================= CHECKOUT ================= */
window.checkout = async () => {
  const btn = $("checkoutBtn");
  const mode = state.shipping.mode;
  
  // Validaciones
  if (state.cart.length === 0) return alert("Tu carrito está vacío");
  
  // Validar campos requeridos según modo
  if (mode === "tj" || mode === "mx") {
    if (!$("addr").value || !$("name").value || !$("cp").value) {
      return alert("Por favor completa los datos de envío (Nombre, Calle, CP)");
    }
    if (mode === "mx" && $("cp").value.length < 5) {
      return alert("El Código Postal debe ser de 5 dígitos");
    }
  }

  btn.disabled = true;
  btn.innerText = "Procesando...";

  try {
    const payload = {
      items: state.cart,
      mode: mode,
      customer: {
        name: $("name").value,
        address: $("addr").value,
        postal_code: $("cp").value
      }
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error al iniciar pago");
    }

  } catch (err) {
    console.error(err);
    alert("Hubo un error: " + err.message);
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA";
  }
};

// Iniciar
init();
