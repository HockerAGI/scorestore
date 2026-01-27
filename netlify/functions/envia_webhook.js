// netlify/functions/envia_webhook.js
// Alias compatible para instalaciones antiguas.
// Redirige la lógica al webhook real de Stripe (stripe_webhook.js)

import { handler as stripeWebhookHandler } from "./stripe_webhook.js";

export async function handler(event, context) {
  return stripeWebhookHandler(event, context);
}