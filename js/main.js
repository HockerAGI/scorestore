const API_BASE = location.hostname === "localhost" ? "/api" : "/.netlify/functions";
const CART_KEY = "score_cart_v25";

// Estado Global
let state = {
  cart: [],
  catalog: {}, // Mapa de ID -> Producto
  shippingMode: "mx", // mx, tj, pickup
  zip: "",
  promo: ""
};

// Selectores DOM
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

// --- INIT ---
async function init() {
  // Cargar carrito guardado
  const saved = localStorage.getItem(CART_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.cart = parsed.items || [];
    state.shippingMode = parsed.mode || "mx";
    state.zip = parsed.zip || "";
  }

  // Restaurar UI inputs
  if ($("shippingMode")) $("shippingMode").value = state.shippingMode;
  if ($("zipCode")) $("zipCode").value = state.zip;

  await loadCatalog();
  updateCartUI();
}

async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json");
    const data = await res.json();
    
    // Renderizar Catálogo
    const container = $("catalog");
    container.innerHTML = "";
    
    data.sections.forEach(sec => {
      // Filtrar productos de esta sección
      const prods = data.products.filter(p => p.sectionId === sec.id);
      if(prods.length === 0) return;

      const secHtml = `
        <section class="catalogSection">
          <h2 class="sectionTitle">${sec.title} <span class="badge">${sec.badge}</span></h2>
          <div class="grid">
            ${prods.map(p => {
              state.catalog[p.id] = p; // Guardar en memoria
              return `
                <article class="card">
                  <div class="cardImg">
                    <img src="${p.img}" alt="${p.name}" loading="lazy">
                  </div>
                  <div class="cardBody">
                    <h3>${p.name}</h3>
                    <div class="price">${money(p.baseMXN)}</div>
                    <div class="cardActions">
                      <select id="size-${p.id}" class="sizeSel">
                        ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
                      </select>
                      <button class="btnAdd" onclick="addToCart('${p.id}')">AGREGAR</button>
                    </div>
                  </div>
                </article>
              `;
            }).join("")}
          </div>
        </section>
      `;
      container.innerHTML += secHtml;
    });

  } catch (e) {
    console.error(e);
    $("catalog").innerHTML = "<p>Error cargando catálogo. Recarga la página.</p>";
  }
}

// --- CART LOGIC ---

window.addToCart = (id) => {
  const size = $(`size-${id}`).value;
  const existing = state.cart.find(i => i.id === id && i.size === size);
  
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push({ id, size, qty: 1 });
  }
  
  saveCart();
  updateCartUI();
  openDrawer();
};

window.removeFromCart = (idx) => {
  state.cart.splice(idx, 1);
  saveCart();
  updateCartUI();
};

function saveCart() {
  // Guardamos items y preferencias de envío
  state.shippingMode = $("shippingMode").value;
  state.zip = $("zipCode").value;
  
  localStorage.setItem(CART_KEY, JSON.stringify({
    items: state.cart,
    mode: state.shippingMode,
    zip: state.zip
  }));
}

window.updateCartUI = () => {
  const list = $("cartItems");
  const count = $("cartCount");
  const subLabel = $("subtotalLabel");
  const shipLabel = $("shippingLabel");
  const totLabel = $("totalLabel");
  const mode = $("shippingMode").value;

  // Actualizar visibilidad de ZIP
  const zipGroup = $("zipGroup");
  if(mode === "pickup") zipGroup.style.display = "none";
  else zipGroup.style.display = "block";

  // Render Items
  list.innerHTML = "";
  let subtotal = 0;
  let itemCount = 0;

  state.cart.forEach((item, idx) => {
    const product = state.catalog[item.id];
    if(!product) return;
    
    const itemTotal = product.baseMXN * item.qty;
    subtotal += itemTotal;
    itemCount += item.qty;

    list.innerHTML += `
      <div class="cartItem">
        <img src="${product.img}" class="itemThumb">
        <div class="itemInfo">
          <h4>${product.name}</h4>
          <p class="meta">Talla: ${item.size} | Cant: ${item.qty}</p>
          <div class="itemPrice">${money(itemTotal)}</div>
        </div>
        <button class="btnRemove" onclick="removeFromCart(${idx})">×</button>
      </div>
    `;
  });

  if(state.cart.length === 0) list.innerHTML = `<div class="emptyCart">Carrito vacío</div>`;
  
  count.innerText = itemCount;
  subLabel.innerText = money(subtotal);

  // Estimación de Envío (Solo UI, cálculo real en backend)
  let shippingCost = 0;
  let shipText = "Pendiente";

  if (mode === "pickup") {
    shippingCost = 0;
    shipText = "Gratis (Fábrica)";
  } else if (mode === "tj") {
    shippingCost = 200;
    shipText = "$200.00 MXN";
  } else {
    // Nacional
    shippingCost = 250; // Base para display
    shipText = "Calc. al pagar";
  }

  shipLabel.innerText = shipText;
  
  // Total Aproximado (Final se calcula en Stripe)
  totLabel.innerText = money(subtotal + shippingCost);
};

// --- CHECKOUT ---

window.initCheckout = async () => {
  const btn = $("checkoutBtn");
  const mode = $("shippingMode").value;
  const zip = $("zipCode").value;
  const promo = $("promoCode").value;

  if (state.cart.length === 0) return toast("Carrito vacío");
  if (mode === "mx" && (!zip || zip.length < 5)) return toast("Ingresa tu Código Postal");

  btn.disabled = true;
  btn.innerText = "Procesando...";

  try {
    const payload = {
      items: state.cart,
      mode: mode,
      promo: promo,
      to: { postal_code: zip }
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
      throw new Error(data.error || "Error desconocido");
    }

  } catch (err) {
    console.error(err);
    toast("Error: " + err.message);
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA SEGURO";
  }
};

window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

window.toast = (msg) => {
  const t = $("toast");
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 3000);
};

// Iniciar app
init();
