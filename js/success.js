(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const heroEmoji = $("#heroEmoji");
  const heroTitle = $("#heroTitle");
  const heroText = $("#heroText");

  const orderId = $("#orderId");
  const orderTotal = $("#orderTotal");
  const orderStatusText = $("#orderStatusText");
  const orderEmail = $("#orderEmail");
  const orderShipMode = $("#orderShipMode");

  const extraHint = $("#extraHint");
  const copyBtn = $("#copyBtn");

  const successSupportEmail = $("#successSupportEmail");
  const successSupportWa = $("#successSupportWa");
  const footerNote = $("#footerNote");

  const STORAGE_KEYS = [
    "scorestore_cart_v3",
    "scorestore_ship_v3",
    "scorestore_promo_v3",
    "scorestore_customer_v3",
    "scorestore_ui_v3",
    "scorestore_cart_v2_pro",
    "scorestore_ship_v2",
  ];

  function clearCart() {
    try {
      for (const key of STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
      window.history.replaceState(null, "", window.location.pathname);
    } catch {}
  }

  function money(value) {
    const n = Number(value);
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n / 100 : 0);
  }

  function safeStr(v, d = "—") {
    return typeof v === "string" && v.trim() ? v.trim() : d;
  }

  function getSessionId() {
    const url = new URL(window.location.href);
    return (
      url.searchParams.get("session_id") ||
      url.searchParams.get("payment_intent") ||
      url.searchParams.get("checkout_id") ||
      url.searchParams.get("order_id") ||
      ""
    ).trim();
  }

  function setHero(type, title, text) {
    const map = {
      paid: ["🏆", "Pago confirmado"],
      pending: ["⏳", "Pago en proceso"],
      error: ["⚠️", "Error de verificación"],
      default: ["🏁", "Estado del pedido"],
    };

    const [emoji, defaultTitle] = map[type] || map.default;

    if (heroEmoji) heroEmoji.textContent = emoji;
    if (heroTitle) heroTitle.textContent = title || defaultTitle;
    if (heroText) heroText.textContent = text || "";
  }

  function normalizeShipMode(mode) {
    const m = String(mode || "").toLowerCase();
    if (m === "pickup") return "Recolección en fábrica";
    if (m === "envia_mx") return "Envío nacional";
    if (m === "envia_us") return "Envío USA";
    if (m === "pickup_local") return "Recolección local";
    if (m === "delivery") return "Entrega";
    return "No definido";
  }

  function applyOrderData(data) {
    const ps = String(data?.payment_status || data?.status || "").toLowerCase();
    const status = String(data?.status || "").toLowerCase();

    if (ps === "paid" || status === "paid" || status.includes("succeeded")) {
      setHero("paid", null, "Tu pago fue confirmado correctamente.");
      clearCart();
    } else if (ps === "unpaid" || status.includes("pending")) {
      setHero("pending", null, "Tu pago está en proceso.");
    } else {
      setHero("default");
    }

    if (orderId) {
      orderId.textContent = safeStr(
        data?.session_id ||
          data?.checkout_session_id ||
          data?.payment_intent ||
          getSessionId()
      );
    }

    if (orderTotal) {
      const total =
        data?.amount_total_cents ??
        data?.total_cents ??
        data?.amount_total_mxn_cents ??
        null;

      if (Number.isFinite(Number(total))) {
        orderTotal.textContent = money(Number(total));
      } else if (Number.isFinite(Number(data?.amount_total_mxn))) {
        orderTotal.textContent = new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: "MXN",
          maximumFractionDigits: 2,
        }).format(Number(data.amount_total_mxn));
      } else {
        orderTotal.textContent = "—";
      }
    }

    if (orderEmail) {
      orderEmail.textContent = safeStr(data?.customer_email || data?.email);
    }

    if (orderShipMode) {
      orderShipMode.textContent = normalizeShipMode(
        data?.shipping_mode || data?.ship_mode || data?.delivery_mode
      );
    }

    if (orderStatusText) {
      orderStatusText.textContent =
        ps === "paid" || status === "paid"
          ? "Pagado"
          : ps === "unpaid" || status.includes("pending")
            ? "Pendiente"
            : "Procesando";
    }
  }

  async function hydrateSupport() {
    try {
      const res = await fetch("/api/site_settings", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const settings = data?.data && typeof data.data === "object" ? data.data : data;

      if (!settings || typeof settings !== "object") return;

      const contact = settings.contact || {};
      const home = settings.home || {};
      const email = String(contact.email || "ventas.unicotextil@gmail.com").trim();
      const whatsappE164 = String(contact.whatsapp_e164 || "5216642368701").trim();
      const whatsappDisplay = String(contact.whatsapp_display || "664 236 8701").trim();
      const footerText = String(home.footer_note || "").trim();

      if (successSupportEmail) {
        successSupportEmail.href = `mailto:${email}`;
        successSupportEmail.textContent = email;
      }

      if (successSupportWa) {
        successSupportWa.href = `https://wa.me/${encodeURIComponent(whatsappE164)}`;
        successSupportWa.textContent = whatsappDisplay;
      }

      const supportEmailLinks = [
        document.getElementById("footerEmailLink"),
        document.getElementById("footerMailLink"),
        document.getElementById("footerMailLinkInline"),
        document.getElementById("privacyEmail"),
      ].filter(Boolean);

      for (const el of supportEmailLinks) {
        el.textContent = email;
        if (el.tagName === "A") {
          el.setAttribute("href", `mailto:${email}`);
        }
      }

      const supportWaLinks = [
        document.getElementById("footerWhatsappLink"),
        document.getElementById("footerWaLink"),
        document.getElementById("footerWaLinkInline"),
      ].filter(Boolean);

      for (const el of supportWaLinks) {
        el.setAttribute("href", `https://wa.me/${encodeURIComponent(whatsappE164)}`);
      }

      const waText = document.getElementById("footerWhatsappText");
      if (waText) waText.textContent = whatsappDisplay;

      const socials = settings.socials || {};
      const socialPairs = [
        ["footerFacebookLink", socials.facebook],
        ["footerInstagramLink", socials.instagram],
        ["footerYoutubeLink", socials.youtube],
      ];

      for (const [id, href] of socialPairs) {
        const el = document.getElementById(id);
        if (el && href) el.setAttribute("href", href);
      }

      if (footerNote && footerText) {
        footerNote.textContent = footerText;
      }

      if (extraHint && footerText && !new URL(window.location.href).searchParams.get("custom_hint")) {
        extraHint.textContent = footerText;
      }
    } catch {}
  }

  async function loadStatus() {
    const sessionId = getSessionId();

    if (!sessionId) {
      setHero("error", "Sin ID de sesión", "No se pudo identificar el pedido.");
      return;
    }

    try {
      setHero("default", "Verificando pedido...", "Estableciendo conexión con el estado de tu compra.");

      const res = await fetch(
        `/api/checkout_status?session_id=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );

      const data = await res.json().catch(() => null);

      if (!data || data.ok === false) {
        throw new Error(data?.error || "No se pudo verificar el estado");
      }

      applyOrderData(data);
    } catch {
      setHero(
        "error",
        "Error temporal",
        "No se pudo verificar el estado en este momento."
      );
    }
  }

  function bindCopy() {
    if (!copyBtn) return;

    copyBtn.addEventListener("click", async () => {
      const text = orderId?.textContent || "";
      if (!text || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        const original = copyBtn.textContent;
        copyBtn.textContent = "Copiado ✅";
        setTimeout(() => {
          copyBtn.textContent = original || "Copiar ID";
        }, 1500);
      } catch {}
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    clearCart();
    bindCopy();
    hydrateSupport();
    loadStatus();
  });
})();