"use strict";

document.addEventListener("DOMContentLoaded", () => {
  try {
    localStorage.removeItem("scorestore_cart_v2_pro");
    localStorage.removeItem("scorestore_ship_v2");
    window.history.replaceState(null, '', window.location.href);
  } catch (e) { console.warn("Aviso: No se pudo limpiar la caché local", e); }

  const qs = new URLSearchParams(location.search);
  const sessionId = qs.get("session_id") || "";
  const $ = (id) => document.getElementById(id);

  const setUI = ({ title, text, emoji, borderColor }) => {
    if ($("heroTitle")) $("heroTitle").textContent = title;
    if ($("heroText")) $("heroText").innerHTML = text; 
    if ($("heroEmoji")) $("heroEmoji").textContent = emoji;
    if (borderColor) document.querySelector("main").style.setProperty('--red', borderColor);
  };

  const fmtMoney = (n) => {
    try { return Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" }); }
    catch { return "$" + Number(n).toFixed(2); }
  };

  const loadStatus = async () => {
    if (!sessionId) {
      if($("orderId")) $("orderId").textContent = "No detectado";
      if($("orderTotal")) $("orderTotal").textContent = "—";
      setUI({
        title: "Sesión Finalizada",
        text: "El proceso de compra terminó. Si no recibes un correo de confirmación en breve, vuelve a intentar el pago.",
        emoji: "🏁"
      });
      return;
    }

    if($("orderId")) $("orderId").textContent = sessionId;

    try {
      const res = await fetch(`/.netlify/functions/checkout_status?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!data || !data.ok) throw new Error(data && data.error ? data.error : "Error de verificación en pasarela.");

      if($("orderTotal")) $("orderTotal").textContent = fmtMoney(data.amount_total_mxn || 0);

      const ps = String(data.payment_status || "").toLowerCase();

      if (ps === "paid") {
        setUI({
          title: "¡PAGO EXITOSO!",
          text: "Tu compra ha sido procesada de manera segura por Stripe. <br><br>Si seleccionaste entrega a domicilio, el sistema de Envía.com está generando tu guía y la recibirás por correo electrónico.",
          emoji: "🏆",
          borderColor: "#28a745"
        });
        if($("extraHint")) $("extraHint").textContent = "Tip: Copia tu ID de pedido por si necesitas soporte técnico. ¡Gracias por adquirir mercancía oficial!";
      } else if (ps === "unpaid") {
        setUI({
          title: "Pedido en Espera de Pago",
          text: "Tu orden ya está registrada en nuestros servidores. <br><br><b>Si elegiste OXXO Pay:</b> Stripe te generó un voucher. Paga en tu sucursal más cercana para que podamos enviar tu paquete.",
          emoji: "⏳",
          borderColor: "var(--black-btn)"
        });
        if($("extraHint")) $("extraHint").textContent = "El inventario se reserva temporalmente. Tu guía logística se generará automáticamente en cuanto el sistema detecte tu pago.";
      } else {
        setUI({
          title: "Pedido Registrado",
          text: "Tu orden está en el sistema. Si el pago aún no se refleja como confirmado, verifica tu aplicación bancaria o revisa tu bandeja de entrada.",
          emoji: "🛡️",
          borderColor: "var(--black-btn)"
        });
        if($("extraHint")) $("extraHint").textContent = "En caso de rechazo bancario, la orden expirará y no se realizará ningún cargo.";
      }
    } catch (e) {
      setUI({
        title: "Procesando Orden...",
        text: "Estamos experimentando latencia para verificar el estado en vivo. <br><br>Tu transacción está segura. Si se cobró, recibirás un recibo oficial en tu correo.",
        emoji: "🛡️",
        borderColor: "var(--black-btn)"
      });
    }
  };

  const copyBtn = $("copyBtn");
  if(copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(sessionId || "");
          const originalText = copyBtn.textContent;
          copyBtn.textContent = "¡Copiado! ✅";
          copyBtn.style.backgroundColor = "#28a745";
          setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = "var(--black-btn)";
          }, 2000);
        } catch(e) {
          alert("Tu navegador no soporta copiado automático. Por favor, selecciona y copia el ID manualmente.");
        }
      });
  }

  loadStatus();
});