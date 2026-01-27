/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_FINAL)
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

// --- ESTADO ---
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v4") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  promo: null
};

// --- CONTENIDO LEGAL (TEXTO EXACTO PROVISTO) ---
const LEGAL_CONTENT = {
  privacy: {
    title: "Aviso de Privacidad",
    html: `
      <h4>AVISO DE PRIVACIDAD</h4>
      <p>BAJATEX, S. de R.L. de C.V., con nombre comercial Único Uniformes, es responsable del uso y protección de los datos personales recabados a través de SCORE Store.</p>
      <p>Los datos personales se utilizan exclusivamente para: Procesar pedidos y pagos, gestionar envíos, facturación y atención al cliente.</p>
      <p>El titular de los datos puede ejercer sus Derechos ARCO enviando una solicitud a: <b>ventas.unicotexti@gmail.com</b></p>
    `
  },
  terms: {
    title: "Términos y Condiciones",
    html: `
      <h4>USO DEL SITIO</h4>
      <p>El uso de SCORE Store está limitado a fines lícitos.</p>
      <h4>CAMBIOS Y DEVOLUCIONES</h4>
      <p>Se aceptan cambios dentro de 30 días naturales (producto nuevo, con etiquetas). No aplica en personalizados o liquidación.</p>
      <h4>FACTURACIÓN</h4>
      <p>Solicitar dentro del mes de compra enviando CSF y pedido a <b>ventas.unicotexti@gmail.com</b>.</p>
    `
  },
  legal: {
    title: "Información Legal",
    html: `
      <h4>INFORMACIÓN COMERCIAL</h4>
      <p><b>Razón Social:</b> BAJATEX, S. de R.L. de C.V.<br>
      <b>Domicilio:</b> Palermo 6106 Interior JK, Col. Anexa Roma, C.P. 22614, Tijuana, BC.<br>
      <b>WhatsApp:</b> +52 664 236 8701</p>
      <h4>SOBRE SCORE INTERNATIONAL</h4>
      <p>Marcas y logotipos propiedad de SCORE International, LLC. Uso bajo licencia oficial.</p>
    `
  },
  contact: {
    title: "Contacto",
    html: `
      <h4>ATENCIÓN AL CLIENTE</h4>
      <p><b>WhatsApp:</b> +52 664 236 8701<br>
      <b>Correo:</b> ventas.unicotexti@gmail.com</p>
      <p>Horario: Lun-Vie 9:00 - 18:00 (Tijuana).</p>
    `
  }
};

// --- SONIDOS ---
const playSound = (type) => {
  // Simple beep synthesis para no depender de archivos
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  
  if(type === 'pop'){
    osc.type = 'sine';
    osc.frequency.value = 800;
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
  } else if(type === 'success'){
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.1);
    g.gain.value = 0.1;
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  }
};

// --- UI HELPERS ---
const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 3000);
  playSound('pop');
};

// --- CATALOGO ---
async function loadCatalog() {
  const grid = $("#productsGrid");
  try {
    const r = await fetch("/data/catalog.json");
    const data = await r.json();
    state.products = data.products;
    renderGrid(state.products);
  } catch (e) {
    grid.innerHTML = "<p>Error cargando productos.</p>";
  }
}

function renderGrid(list) {
  const grid = $("#productsGrid");
  grid.innerHTML = "";
  if(list.length === 0){ grid.innerHTML = "<p style='padding:20px; opacity:0.6'>No hay productos en esta categoría.</p>"; return; }

  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    const sizes = p.sizes || ["Unitalla"];
    card.innerHTML = `
      <div class="cardImg"><img src="${p.img}" loading="lazy" alt="${p.name}"></div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMXN(p.baseMXN)}</div>
        <div class="cardControls">
          <select id="size-${p.id}">${sizes.map(s=>`<option value="${s}">${s}</option>`).join("")}</select>
          <button onclick="addToCart('${p.id}')"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// --- CART LOGIC ---
window.addToCart = (id) => {
  const p = state.products.find(x => x.id === id);
  const size = $(`#size-${id}`).value;
  const key = `${id}-${size}`;
  const exist = state.cart.find(i => i.key === key);
  
  if (exist) exist.qty++;
  else state.cart.push({ key, id: p.id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1, sku: p.sku }); // sku added for shipping calc
  
  saveCart();
  openCart();
  toast("Agregado al equipo");
};

function saveCart() {
  localStorage.setItem("score_cart_v4", JSON.stringify(state.cart));
  renderCart();
  $("#cartCount").textContent = state.cart.reduce((a,b)=>a+b.qty,0);
}

function renderCart() {
  const box = $("#cartItems");
  box.innerHTML = "";
  let subtotal = 0;
  
  state.cart.forEach((item, idx) => {
    subtotal += item.price * item.qty;
    const row = document.createElement("div");
    row.className = "cartRow";
    row.innerHTML = `
      <div class="cartThumb"><img src="${item.img}" alt="img"></div>
      <div class="cartInfo">
        <div class="name">${item.name}</div>
        <div class="price" style="font-size:11px; opacity:0.7">${item.size} | ${fmtMXN(item.price)}</div>
      </div>
      <div class="qty">
        <button class="qtyBtn" onclick="modQty(${idx}, -1)">-</button>
        <span style="font-weight:bold; font-size:13px">${item.qty}</span>
        <button class="qtyBtn" onclick="modQty(${idx}, 1)">+</button>
      </div>
    `;
    box.appendChild(row);
  });

  const shipCost = state.shipping.quote || 0;
  const total = subtotal + shipCost;

  $("#cartSubtotal").textContent = fmtMXN(subtotal);
  $("#cartShipping").textContent = state.shipping.quote === 0 ? "Gratis / Pendiente" : fmtMXN(shipCost);
  $("#cartTotal").textContent = fmtMXN(total);
  $("#miniShipLabel").textContent = state.shipping.label;
}

window.modQty = (idx, delta) => {
  state.cart[idx].qty += delta;
  if (state.cart[idx].qty <= 0) state.cart.splice(idx, 1);
  saveCart();
};

window.openCart = () => {
  $("#cartDrawer").classList.add("open");
  $("#backdrop").classList.add("show");
  renderCart();
};
window.closeCart = () => {
  $("#cartDrawer").classList.remove("open");
  $("#backdrop").classList.remove("show");
};

// --- ENVÍOS / COTIZACIÓN ---
// Manejo de UI para mostrar campo CP
$("#shippingMode").addEventListener("change", (e)=>{
  const mode = e.target.value;
  if(mode === 'pickup') {
    $("#miniZipContainer").style.display = 'none';
    state.shipping = { mode: 'pickup', quote: 0, label: "Pickup Tijuana (Gratis)" };
    saveCart();
  } else {
    $("#miniZipContainer").style.display = 'block';
    state.shipping = { mode, quote: 0, label: "Cotización pendiente..." };
    saveCart(); // Actualiza UI
  }
});

window.quoteShippingMini = async () => {
  const mode = $("#shippingMode").value;
  const zip = $("#miniZip").value;
  if(!zip || zip.length < 4) { toast("Ingresa un Código Postal válido"); return; }
  
  $("#miniShipLabel").textContent = "Cotizando con Envia.com...";
  
  try {
    const res = await fetch("/api/quote", {
      method: "POST",
      body: JSON.stringify({ mode, zip, items: state.cart })
    });
    const data = await res.json();
    
    if(!data.ok) throw new Error(data.error || "Error al cotizar");
    
    state.shipping = {
      mode,
      quote: data.amount,
      label: `${data.carrier} (${data.eta})`
    };
    saveCart();
    toast("Envío actualizado");
    playSound('success');
  } catch(e) {
    $("#miniShipLabel").textContent = "Error cotizando. Intenta Pickup.";
    toast(e.message);
  }
};

// --- CHECKOUT ---
window.checkout = async () => {
  if(state.cart.length === 0) return toast("Tu carrito está vacío");
  
  // Validar si requiere envío y no ha cotizado
  if(state.shipping.mode !== 'pickup' && state.shipping.quote === 0) {
    return toast("Por favor cotiza tu envío antes de pagar");
  }

  const btn = $("#checkoutBtn");
  const original = btn.innerHTML;
  btn.innerHTML = "<i class='fa-solid fa-circle-notch fa-spin'></i> PROCESANDO...";
  btn.disabled = true;

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ 
        cart: state.cart,
        shippingMode: state.shipping.mode,
        zip: $("#miniZip").value || "",
        promoCode: $("#promoCode").value 
      })
    });
    const data = await res.json();
    if(data.ok && data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error iniciando pago");
    }
  } catch(e) {
    toast(e.message);
    btn.innerHTML = original;
    btn.disabled = false;
  }
};

// --- LEGAL MODAL ---
$$(".jsLegalLink").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const type = btn.getAttribute("data-legal");
    const content = LEGAL_CONTENT[type];
    if(content){
      $("#legalTitle").textContent = content.title;
      $("#legalBody").innerHTML = content.html;
      $("#legalModal").classList.add("show");
    }
  });
});
$("#legalClose").addEventListener("click", ()=> $("#legalModal").classList.remove("show"));
$("#legalBackdrop").addEventListener("click", ()=> $("#legalModal").classList.remove("show"));

// --- NOTIFICACIONES SOCIAL PROOF (INSTRUCCIÓN 8) ---
const SALES_MOCK = [
  "Hoodie Baja 1000 enviada a Mexicali",
  "Gorra Oficial vendida en CDMX",
  "Camiseta SF250 enviada a San Diego",
  "Chamarra Oficial recogida en Tijuana"
];
function startNotifications() {
  setInterval(() => {
    if(!document.hidden && Math.random() > 0.6) {
      const msg = SALES_MOCK[Math.floor(Math.random() * SALES_MOCK.length)];
      toast(`🛍️ ${msg}`);
    }
  }, 45000); // Cada 45 seg aprox, no intrusivo
}

// --- IA CHAT (FALLBACK) ---
window.toggleAiAssistant = () => $("#aiChatModal").classList.toggle("show");
window.sendAiMessage = async () => {
  const inp = $("#aiInput");
  const txt = inp.value;
  if(!txt) return;
  
  // Add user msg
  const box = $("#aiMessages");
  box.innerHTML += `<div class="ai-msg ai-me">${txt}</div>`;
  inp.value = "";
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ message: txt }) });
    const data = await res.json();
    if(!data.ok) throw new Error("AI Fail");
    box.innerHTML += `<div class="ai-msg ai-bot">${data.reply}</div>`;
  } catch (e) {
    // Fallback local si falla la API
    box.innerHTML += `<div class="ai-msg ai-bot">🏎️ <b>Score Bot:</b> Disculpa, mi conexión a pits está lenta. Para dudas urgentes de tallas o envíos mándanos WhatsApp al +52 664 236 8701.</div>`;
  }
  box.scrollTop = box.scrollHeight;
};

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  loadCatalog();
  startNotifications();
  
  // Intro Logic
  setTimeout(() => { 
    if($("#intro")) $("#intro").style.display = 'none'; 
  }, 2500); // 2.5s intro force close
  $("#introSkip").addEventListener("click", () => $("#intro").style.display = 'none');
  
  // Filters
  $$(".chip").forEach(c => c.addEventListener("click", (e)=>{
    $$(".chip").forEach(x=>x.classList.remove("active"));
    e.target.classList.add("active");
    // Filtro simple
    const f = e.target.getAttribute("data-filter");
    if(f === 'ALL') renderGrid(state.products);
    else renderGrid(state.products.filter(p => p.sectionId === f));
  }));
});