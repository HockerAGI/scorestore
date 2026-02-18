import { getSupabaseAdmin, json, readJsonBody, withCORS } from "./_shared.js";

export const handler = withCORS(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = await readJsonBody(event);

    const tracking =
      body?.tracking_number ||
      body?.tracking ||
      body?.data?.tracking ||
      body?.data?.tracking_number ||
      null;

    const status = body?.status || body?.data?.status || "unknown";
    const stripe_session_id = body?.stripe_session_id || body?.data?.stripe_session_id || null;
    const event_type = body?.event_type || body?.event || body?.type || null;

    const db = getSupabaseAdmin();

    // Dedupe idempotente por provider + raw_hash (raw_hash es GENERATED en SQL)
    await db.from("shipping_webhooks").upsert(
      {
        provider: "envia",
        event_type,
        status: String(status),
        tracking_number: tracking,
        stripe_session_id,
        raw: body,
      },
      { onConflict: "provider,raw_hash" }
    );

    // Opcional: actualiza estado del label por tracking
    if (tracking) {
      await db.from("shipping_labels").update({ status: String(status) }).eq("tracking_number", tracking);
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(500, { error: err?.message || "Server error" });
  }
});