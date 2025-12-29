let CART = JSON.parse(localStorage.getItem("score_cart") || "[]");

const $ = id => document.getElementById(id);
const money = n => `$${Number(n || 0).toLocaleString("es-MX")} MXN`;

function saveCart() {
  localStorage.setItem("score_cart", JSON.stringify(CART));
}

function updateTotals() {
  const total = CART.reduce((s, i) => s + (i.price * i.qty), 0);
  $("barTotal").textContent = money(total);
  $("payBtn").disabled = CART.length === 0;
}

function addToCart(product) {
  const found = CART.find(p => p.id === product.id);
  if (found) found.qty++;
  else CART.push({ ...product, qty: 1 });
  saveCart();
  updateTotals();
}

async function checkout() {
  const res = await fetch("/.netlify/functions/create_checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: CART,
      mode: "pickup"
    })
  });

  const data = await res.json();
  if (data.url) location.href = data.url;
  else alert(data.error || "Error iniciando pago");
}

window.addEventListener("load", updateTotals);