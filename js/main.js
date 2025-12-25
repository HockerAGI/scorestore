// js/main.js

const STRIPE_PK = window.STRIPE_PK;
const USD_RATE = 17.5;

const $ = id => document.getElementById(id);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let ship = { method: null, cost: 0 };

function formatMXN(v) {
  return `$${v.toLocaleString("es-MX")} MXN`;
}

function save() {
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCart();
}

function updateCart(resetShip = true) {
  const method = $("shipMethod").value;
  ship.method = method;

  if (resetShip) {
    if (method === "pickup") ship.cost = 0;
    if (method === "tj") ship.cost = 200;
    if (method === "mx") {
      ship.cost = 0;
      if ($("cp").value.length === 5) quoteShipping();
    }
  }

  $("shipForm").style.display = method === "mx" ? "block" : "none";

  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  const total = sub + ship.cost;

  $("cartCount").innerText = cart.reduce((a, b) => a + b.qty, 0);
  $("lnSub").innerText = formatMXN(sub);
  $("lnShip").innerText = formatMXN(ship.cost);
  $("lnTotal").innerText = formatMXN(total);

  $("cartBody").innerHTML =
    cart
      .map(
        (i, x) => `
    <div class="cart-item">
      <img src="${i.img}" />
      <div class="cart-item-details">
        <div class="cart-item-title">${i.name}</div>
        <div style="font-size:12px">Talla: ${i.size}</div>
      </div>
      <div>
        <div>x${i.qty}</div>
        <div class="cart-remove" onclick="cart.splice(${x},1);save()">Eliminar</div>
      </div>
    </div>
  `
      )
      .join("") || `<div style="text-align:center;opacity:.5">Carrito vacío</div>`;

  let valid = cart.length > 0 && method;
  if (method === "mx") {
    valid =
      valid &&
      $("cp").value.length === 5 &&
      $("addr").value.length > 5 &&
      ship.cost > 0;
  }

  $("payBtn").disabled = !valid;
}

function openDrawer() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  updateCart();
}

function closeAll() {
  $("drawer").classList.remove("active");
  $("overlay").classList.remove("active");
}

async function quoteShipping() {
  const cp = $("cp").value;
  if (cp.length !== 5) return;

  $("quoteResult").innerText = "Cotizando envío...";

  try {
    const res = await fetch("/.netlify/functions/quote_shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart,
        to: { postal_code: cp },
        mode: "auto"
      })
    });

    const data = await res.json();
    ship.cost = data.mxn || 250;
    $("quoteResult").innerText = `Envío: ${formatMXN(ship.cost)} (${data.carrier || "MX"})`;
    updateCart(false);
  } catch (e) {
    ship.cost = 250;
    updateCart(false);
  }
}

async function checkout() {
  const btn = $("payBtn");
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;

  try {
    const stripe = Stripe(STRIPE_PK);

    const payload = {
      items: cart,
      mode: ship.method,
      to: { postal_code: $("cp").value }
    };

    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error("No se pudo iniciar el pago");
  } catch (e) {
    alert(e.message);
    btn.innerText = "IR A PAGAR";
    btn.disabled = false;
  }
}

["cp", "addr", "name", "shipMethod"].forEach(id =>
  $(id)?.addEventListener("input", () => updateCart())
);

$("overlay").onclick = closeAll;
updateCart();