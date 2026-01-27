import { ok, fail, parseJSON, enviaQuote, normalizeCountry, normalizeZip } from "./_shared.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return fail(405, "Method Not Allowed");

  try {
    const { mode, zip, items } = parseJSON(event.body);

    if (mode === "pickup") {
      return ok({ amount: 0, carrier: "Pickup", eta: "Inmediato" });
    }

    const postalCode = normalizeZip(zip);
    const country = normalizeCountry(mode);

    if (!postalCode) return fail(400, "Código postal requerido");

    // Construir paquetes para Envia (simplificado a peso volumétrico estandar si no hay specs detalladas)
    // Asumimos un peso promedio de 0.5kg por item para asegurar cotización si falta data en BD
    const packages = items.map(item => ({
      content: "Ropa deportiva",
      amount: item.qty,
      type: "box",
      dimensions: { length: 30, width: 20, height: 10 },
      weight: 1 // 1kg minimo para asegurar tarifa
    }));

    const rates = await enviaQuote({
      origin: {
        name: "Unico Uniformes",
        company: "Bajatex",
        email: "ventas.unicotexti@gmail.com",
        phone: "6642368701",
        street: "Palermo",
        number: "6106",
        district: "Anexa Roma",
        city: "Tijuana",
        state: "BC",
        country: "MX",
        postalCode: "22614"
      },
      destination: {
        country: country,
        postalCode: postalCode
      },
      packages: packages,
      shipment: { carrier: "fedex", type: "package" } // Forzar FedEx como preferencia
    });

    if (!rates || rates.length === 0) throw new Error("No hay cobertura para este CP");

    // Tomar la opción más económica
    const bestRate = rates.sort((a, b) => a.totalAmount - b.totalAmount)[0];

    return ok({
      amount: bestRate.totalAmount,
      carrier: bestRate.carrier,
      eta: bestRate.deliveryEstimate || "3-7 días"
    });

  } catch (e) {
    console.error(e);
    return fail(500, "No se pudo cotizar el envío. Verifica tu CP.");
  }
}