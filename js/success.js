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

  const money = (value) => {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(safe);
  };

  const safeStr = (v, d = "—") =>
    typeof v === "string" && v.trim() ? v.trim() : d;

  const getSessionId = () => {
    const url = new URL(window.location.href);
    return String(url.searchParams.get("session_id") || "").trim();
  };

  function setHero(type, title, text) {
    if (type === "paid") {
      if (heroEmoji) heroEmoji.textContent = "✅";
      if (heroTitle) heroTitle.textContent = title || "Pago confirmado";
      if (heroText) {
        heroText.textContent =
          text ||
          "Tu compra quedó registrada correctamente. Ya estamos preparando tu pedido oficial.";
      }
      return;
    }

    if (type === "pending") {
      if (heroEmoji) heroEmoji.textContent = "⏳";
      if (heroTitle) heroTitle.textContent = title || "Pago pendiente";
      if (heroText) {
        heroText.textContent =
          text ||
          "Tu orden fue creada, pero el pago todavía está en proceso de confirmación.";
      }
      return;
    }

    if (type === "error") {
      if (heroEmoji) heroEmoji.textContent = "⚠️";
      if (heroTitle) heroTitle.textContent = title || "No pude verificar tu pedido";
      if (heroText) {
        heroText.textContent =
          text ||
          "No logramos recuperar el estado de tu compra en este momento. Intenta de nuevo en unos minutos.";
      }
      return;
    }

    if (heroEmoji) heroEmoji.textContent = "🏁";
    if (heroTitle) heroTitle.textContent = title || "Estado del pedido";
    if (heroText) {
      heroText.textContent =
        text ||
        "Estamos verificando tu información de compra.";
    }
  }

  function normalizeShipMode(mode) {
    const m = String(mode || "").toLowerCase().trim();
    if (m === "pickup") return "Recolección en fábrica";
    if (m === "envia_mx") return "Envío nacional MX";
    if (m === "envia_us") return "Envío USA";
    return "No definido";
  }

  function applyOrderData(data) {
    const paymentStatus = String(data?.payment_status || "").toLowerCase().trim();
    const status = String(data?.status || "").toLowerCase().trim();

    if (paymentStatus === "paid" || status === "paid") {
      setHero(
        "paid",
        "Pago confirmado",
        "Tu compra fue aprobada y quedó registrada correctamente. Ya estamos preparando tu pedido oficial."
      );
    } else if (
      paymentStatus === "unpaid" ||
      status === "pending_payment" ||
      status === "pending"
    ) {
      setHero(
        "pending",
        "Pago pendiente",
        "Tu pedido fue generado, pero el pago aún no termina de reflejarse. Si usaste OXXO Pay, esto puede tardar un poco más."
      );
    } else {
      setHero(
        "default",
        "Estado del pedido",
        "Estamos mostrando la información más reciente disponible para tu orden."
      );
    }

    if (orderId) {
      orderId.textContent = safeStr(data?.session_id || "");
    }

    if (orderTotal) {
      orderTotal.textContent = money(data?.amount_total_mxn || 0);
    }

    if (orderStatusText) {
      const readable =
        paymentStatus === "paid" || status === "paid"
          ? "Pagado"
          : status === "pending_payment" || paymentStatus === "unpaid"
            ? "Pendiente"
            : safeStr(status || paymentStatus || "Desconocido");
      orderStatusText.textContent = readable;
    }

    if (orderEmail) {
      orderEmail.textContent = safeStr(data?.customer_email || "No disponible");
    }

    if (orderShipMode) {
      orderShipMode.textContent = normalizeShipMode(data?.shipping_mode);
    }

    if (extraHint) {
      if (String(data?.shipping_mode || "").toLowerCase() === "pickup") {
        extraHint.textContent =
          "Elegiste recolección en fábrica. Te contactaremos para coordinar entrega o confirmación.";
      } else if (
        String(data?.payment_status || "").toLowerCase() === "paid" ||
        String(data?.status || "").toLowerCase() === "paid"
      ) {
        extraHint.textContent =
          "Tu pago ya fue confirmado. Cuando tu guía quede generada, recibirás actualización por correo.";
      } else {
        extraHint.textContent =
          "Si pagaste en efectivo vía OXXO, la confirmación puede tardar hasta 1 día hábil. Te enviaremos actualizaciones a tu correo.";
      }
    }
  }

  async function hydrateSupport() {
    try {
      const res = await fetch("/api/site_settings", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!data || !data.ok) return;

      const contact = data.contact || {};
      const email = String(contact.email || "").trim();
      const waE164 = String(contact.whatsapp_e164 || "").trim();
      const waDisplay = String(contact.whatsapp_display || "").trim();

      if (email && successSupportEmail) {
        successSupportEmail.href = `mailto:${email}`;
        successSupportEmail.textContent = email;
      }

      if (successSupportWa) {
        if (waE164) successSupportWa.href = `https://wa.me/${encodeURIComponent(waE164)}`;
        if (waDisplay) successSupportWa.textContent = waDisplay;
      }
    } catch {}
  }

  async function loadStatus() {
    const sessionId = getSessionId();

    if (!sessionId) {
      setHero(
        "error",
        "Falta el ID del pedido",
        "No encontramos un identificador de sesión para consultar tu compra."
      );

      if (orderId) orderId.textContent = "No disponible";
      if (orderTotal) orderTotal.textContent = "—";
      if (orderStatusText) orderStatusText.textContent = "No disponible";
      if (orderEmail) orderEmail.textContent = "No disponible";
      if (orderShipMode) orderShipMode.textContent = "No disponible";

      return;
    }

    try {
      setHero(
        "default",
        "Verificando pedido",
        "Estamos consultando el estado más reciente de tu orden con Stripe."
      );

      const res = await fetch(
        `/api/checkout_status?session_id=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo consultar el pedido.");
      }

      applyOrderData(data);
    } catch (e) {
      setHero(
        "error",
        "No pude verificar tu pedido",
        String(e?.message || "Ocurrió un problema al consultar el estado del pedido.")
      );

      if (orderId) orderId.textContent = sessionId || "—";
      if (orderStatusText) orderStatusText.textContent = "Error";
    }
  }

  function bindCopy() {
    if (!copyBtn) return;

    copyBtn.addEventListener("click", async () => {
      const text = (orderId?.textContent || "").trim();
      if (!text || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copiado";
        setTimeout(() => {
          copyBtn.textContent = "Copiar ID";
        }, 1600);
      } catch {
        copyBtn.textContent = "No se pudo copiar";
        setTimeout(() => {
          copyBtn.textContent = "Copiar ID";
        }, 1600);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindCopy();
    hydrateSupport();
    loadStatus();
  });
})();
