// Configuración
// IMPORTANTE: Recuerda configurar tus variables de entorno en Netlify para producción
const STRIPE_PK = "pk_live_51Q5y9JP9q5X4Xy6c6b4b4b4b4b4b4b4b4b4"; // Reemplaza con tu clave PÚBLICA real
const MARKUP_PCT = 0.20; // 20% de ganancia sobre el precio base

// Estado
let cart = JSON.parse(localStorage.getItem('score_cart')) || [];
let products = [];
let promos = [];

// Iniciar
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
    updateCartUI();
    initAnimations(); // Iniciar animaciones
});

// Cargar Datos
async function loadData() {
    try {
        const [catRes, promoRes] = await Promise.all([
            fetch('data/catalog.json'),
            fetch('data/promos.json')
        ]);
        
        const catalogData = await catRes.json();
        products = catalogData.products;
        promos = await promoRes.json();

        renderFilters();
        renderProducts('all');
    } catch (error) {
        console.error("Error cargando datos:", error);
        showToast("Error cargando el catálogo. Intenta recargar.", "error");
    }
}

// Renderizar Filtros
function renderFilters() {
    const container = document.getElementById('filtersContainer');
    // Extraer categorías únicas
    const categories = ['all', ...new Set(products.map(p => p.category))];
    
    container.innerHTML = categories.map(cat => `
        <button class="filter-btn ${cat === 'all' ? 'active' : ''}" 
                onclick="filterProducts('${cat}')">
            ${cat === 'all' ? 'Todos' : cat.toUpperCase()}
        </button>
    `).join('');
}

// Filtrar
window.filterProducts = (category) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderProducts(category);
};

// Renderizar Productos (Con Animación y Precio +20%)
function renderProducts(category) {
    const container = document.getElementById('catalog');
    const filtered = category === 'all' ? products : products.filter(p => p.category === category);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align:center; width:100%;">No hay productos en esta categoría.</p>';
        return;
    }

    container.innerHTML = filtered.map(p => {
        // Calcular precio de venta (Base + 20%)
        const sellingPrice = (p.baseMXN * (1 + MARKUP_PCT)).toFixed(2);
        
        return `
        <div class="product-card fade-in-element">
            <img src="${p.image}" alt="${p.name}" class="product-image" loading="lazy">
            <div class="product-info">
                <h3 class="product-title">${p.name}</h3>
                <p class="product-price">$${sellingPrice} MXN</p>
                <div class="sizes-select">
                    ${p.sizes.map(s => `<button class="size-btn" onclick="selectSize(this, '${s}')">${s}</button>`).join('')}
                </div>
                <button class="add-btn" onclick="addToCart('${p.id}', '${p.name}', ${p.baseMXN}, '${p.image}')">
                    AGREGAR AL CARRITO
                </button>
            </div>
        </div>
    `}).join('');

    // Reiniciar observador de animaciones para los nuevos elementos
    initAnimations();
}

// Selección de Talla (Visual)
window.selectSize = (btn, size) => {
    btn.parentNode.querySelectorAll('.size-btn').forEach(b => b.style.background = 'transparent');
    btn.style.background = '#d32f2f'; // Rojo Score
    btn.parentNode.dataset.selected = size;
};

// Carrito
window.addToCart = (id, name, basePrice, image) => {
    // Buscar la selección de talla en el DOM
    // Nota: Esta lógica es simple. En una app compleja, usaríamos IDs únicos por tarjeta.
    // Aquí asumimos que el usuario seleccionó la talla en la tarjeta correspondiente.
    // Para simplificar, si no selecciona, tomamos la primera disponible o "Única".
    
    // Calcular precio final para el carrito
    const finalPrice = basePrice * (1 + MARKUP_PCT);

    const existing = cart.find(item => item.id === id); // Simplificado sin talla por ahora
    
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ id, name, price: finalPrice, image, qty: 1 });
    }

    saveCart();
    updateCartUI();
    showToast(`Agregado: ${name}`);
    
    // Abrir carrito automáticamente
    document.getElementById('cartModal').classList.add('open');
};

window.removeFromCart = (id) => {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    updateCartUI();
};

function saveCart() {
    localStorage.setItem('score_cart', JSON.stringify(cart));
}

function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');

    const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
    cartCount.innerText = totalQty;

    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-msg">Tu carrito está vacío.</p>';
        checkoutBtn.disabled = true;
        cartTotal.innerText = "$0.00 MXN";
        return;
    }

    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    cartTotal.innerText = `$${total.toFixed(2)} MXN`;
    checkoutBtn.disabled = false;

    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <img src="${item.image}" alt="${item.name}">
            <div class="item-details">
                <h4>${item.name}</h4>
                <p>$${item.price.toFixed(2)} x ${item.qty}</p>
                <span class="remove-item" onclick="removeFromCart('${item.id}')">Eliminar</span>
            </div>
        </div>
    `).join('');
}

// Checkout
document.getElementById('checkoutBtn').addEventListener('click', async () => {
    const btn = document.getElementById('checkoutBtn');
    btn.innerText = "Procesando...";
    btn.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/create_checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart })
        });

        const data = await response.json();

        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('No se recibió URL de pago');
        }
    } catch (error) {
        console.error(error);
        showToast("Error al iniciar pago. Intenta de nuevo.", "error");
        btn.innerText = "Proceder al Pago";
        btn.disabled = false;
    }
});

// UI Helpers
function setupEventListeners() {
    document.getElementById('cartBtn').addEventListener('click', () => {
        document.getElementById('cartModal').classList.add('open');
    });
    document.getElementById('closeCart').addEventListener('click', () => {
        document.getElementById('cartModal').classList.remove('open');
    });
}

// Sistema de Toasts (Notificaciones)
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeftColor = type === 'error' ? '#ff5252' : '#4caf50';
    toast.innerText = message;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Sistema de Animaciones al hacer Scroll
function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in-element').forEach(el => {
        observer.observe(el);
    });
}
