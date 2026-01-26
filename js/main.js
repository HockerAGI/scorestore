/* =========================================================
   SCORE STORE · ENGINE v2026 (RECONSTRUIDO)
   ========================================================= */

(function () {
    "use strict";

    const API_BASE = "/.netlify/functions";
    const CART_KEY = "score_cart_v2026";
    let cart = [];
    let catalog = { products: [], sections: [] };

    // --- ELEMENTOS UI ---
    const $ = (id) => document.getElementById(id);
    const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

    // --- CARGA DE DATOS ---
    async function init() {
        try {
            const res = await fetch("/data/catalog.json");
            catalog = await res.json();
            loadCart();
            updateCartUI();
            runSplash();
        } catch (e) { console.error("Error inicializando tienda."); }
    }

    // --- CARRITO ---
    window.addToCart = (id) => {
        const prod = catalog.products.find(p => p.id === id);
        const size = $(`size_${id}`)?.value || "L";
        const item = { ...prod, selectedSize: size, qty: 1 };
        
        const existing = cart.find(i => i.id === id && i.selectedSize === size);
        if (existing) existing.qty++;
        else cart.push(item);

        saveCart();
        updateCartUI();
        toast("🏁 ¡Agregado al equipo!");
        if (window.fbq) fbq('track', 'AddToCart', { content_ids: [id], value: prod.baseMXN, currency: 'MXN' });
    };

    function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    function loadCart() { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }

    window.updateCartUI = () => {
        const list = $("cartItems");
        if (!list) return;
        
        let subtotal = 0;
        list.innerHTML = cart.map((item, idx) => {
            subtotal += (item.baseMXN * item.qty);
            return `
            <div class="cart-card">
                <img src="${item.img}" width="50">
                <div style="flex:1">
                    <div class="cName">${item.name}</div>
                    <small>Talla: ${item.selectedSize}</small>
                    <div class="qty-ctrl">
                        <button onclick="modQty(${idx}, -1)">-</button>
                        <span>${item.qty}</span>
                        <button onclick="modQty(${idx}, 1)">+</button>
                    </div>
                </div>
                <div>${money(item.baseMXN * item.qty)}</div>
            </div>`;
        }).join("");

        const shipMode = document.querySelector('input[name="shipMode"]:checked')?.value;
        let shipCost = shipMode === 'mx' ? 250 : (shipMode === 'us' ? 800 : 0);
        
        $("grandTotal").innerText = money(subtotal + shipCost);
        $("cartCount").innerText = cart.reduce((a, b) => a + b.qty, 0);
        $("shipForm").style.display = shipMode === 'pickup' ? 'none' : 'block';
    };

    window.modQty = (idx, delta) => {
        cart[idx].qty += delta;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
        saveCart();
        updateCartUI();
    };

    // --- CHECKOUT (Stripe) ---
    window.checkout = async () => {
        if (!cart.length) return toast("Tu carrito está vacío.");
        const btn = $("checkoutBtn");
        btn.innerText = "PROCESANDO...";
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/create_checkout`, {
                method: "POST",
                body: JSON.stringify({
                    cart,
                    shippingMode: document.querySelector('input[name="shipMode"]:checked').value,
                    zip: $("cp")?.value,
                    promoCode: $("promo")?.value
                })
            });
            const { url } = await res.json();
            if (url) window.location.href = url;
            else throw new Error();
        } catch (e) {
            toast("Error al conectar con Stripe.");
            btn.innerText = "PAGAR AHORA";
            btn.disabled = false;
        }
    };

    // --- IA: ESTRATEGA DEL DESIERTO ---
    window.toggleAiAssistant = () => $("aiChatModal").classList.toggle("active");

    window.sendAiMessage = async () => {
        const input = $("aiInput");
        const box = $("aiMessages");
        const msg = input.value.trim();
        if (!msg) return;

        box.innerHTML += `<div class="ai-bubble user">${msg}</div>`;
        input.value = "";
        
        const loadingId = "ai-" + Date.now();
        box.innerHTML += `<div class="ai-bubble bot" id="${loadingId}">...</div>`;
        box.scrollTop = box.scrollHeight;

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                body: JSON.stringify({ message: msg })
            });
            const data = await res.json();
            $(loadingId).innerText = data.reply;
        } catch (e) {
            $(loadingId).innerText = "Tengo problemas de conexión en el desierto. Intenta de nuevo.";
        }
        box.scrollTop = box.scrollHeight;
    };

    // --- UTILS ---
    window.openCatalog = (sectionId) => {
        const products = catalog.products.filter(p => p.sectionId === sectionId);
        $("catContent").innerHTML = products.map(p => `
            <div class="p-card">
                <img src="${p.img}">
                <div class="p-body">
                    <h3>${p.name}</h3>
                    <div class="p-price">${money(p.baseMXN)}</div>
                    <select id="size_${p.id}">${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}</select>
                    <button class="p-btn-add" onclick="addToCart('${p.id}')">AGREGAR AL EQUIPO</button>
                </div>
            </div>
        `).join("");
        $("modalCatalog").classList.add("active");
        $("overlay").classList.add("active");
    };

    window.closeAll = () => {
        document.querySelectorAll(".active").forEach(el => el.classList.remove("active"));
    };

    window.toast = (m) => {
        const t = $("toast");
        t.innerText = m; t.classList.add("show");
        setTimeout(() => t.classList.remove("show"), 3000);
    };

    window.toggleCart = () => {
        $("cartDrawer").classList.toggle("active");
        $("overlay").classList.toggle("active");
    };

    function runSplash() {
        const rev = $("rev-val");
        let r = 0;
        const itv = setInterval(() => {
            r += 750; if (r >= 8000) r = 8000;
            rev.innerText = String(r).padStart(4, '0');
        }, 100);
        setTimeout(() => {
            clearInterval(itv);
            $("splash-screen").style.opacity = "0";
            setTimeout(() => $("splash-screen").style.display = "none", 500);
        }, 2000);
    }

    document.addEventListener("DOMContentLoaded", init);
})();