const modal = document.querySelector(".modal");
const overlay = document.querySelector(".overlay");
const catGrid = document.querySelector(".catGrid");
const catTitle = document.querySelector(".dTitle");

let CATALOG = [];

/* ===========================
   CARGAR CATÁLOGO
=========================== */
async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    CATALOG = await res.json();
  } catch (err) {
    console.error("Error cargando catálogo", err);
  }
}

/* ===========================
   RENDER DE CATEGORÍA
=========================== */
function renderCategory(category) {
  catGrid.innerHTML = "";

  const items = CATALOG.filter(p => p.category === category);

  if (!items.length) {
    catGrid.innerHTML = "<p>No hay productos en esta colección.</p>";
    return;
  }

  items.forEach(p => {
    const card = document.createElement("div");
    card.className = "prodCard";
    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}" loading="lazy" />
      <strong>${p.name}</strong>
      <span>$${p.price} MXN</span>
      <button class="btn-sm white">Agregar</button>
    `;
    catGrid.appendChild(card);
  });
}

/* ===========================
   ABRIR MODAL
=========================== */
function openCatalog(category) {
  catTitle.textContent = category.replace(/_/g, " ");
  renderCategory(category);
  modal.classList.add("active");
  overlay.classList.add("active");
  document.body.classList.add("modalOpen");
}

/* ===========================
   CERRAR MODAL
=========================== */
function closeModal() {
  modal.classList.remove("active");
  overlay.classList.remove("active");
  document.body.classList.remove("modalOpen");
}

/* ===========================
   EVENTOS
=========================== */
document.addEventListener("click", e => {
  const card = e.target.closest(".card");
  if (card) {
    openCatalog(card.dataset.category);
  }

  if (
    e.target.classList.contains("overlay") ||
    e.target.classList.contains("closeBtn")
  ) {
    closeModal();
  }
});

/* ===========================
   INIT
=========================== */
loadCatalog();