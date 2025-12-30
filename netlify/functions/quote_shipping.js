import { json, safeParse, needEnv } from "./_shared.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const body = safeParse(event.body);
  if (!body?.to?.postal_code) {
    return json(400, { error: "Missing postal code" });
  }

  const res = await fetch("https://api.envia.com/ship/rate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${needEnv("ENVIA_API_KEY")}`
    },
    body: JSON.stringify({
      origin: { postal_code: "22000" },
      destination: { postal_code: body.to.postal_code },
      packages: [{
        weight: 1,
        dimensions: { length: 20, width: 20, height: 10 }
      }]
    })
  });

  const data = await res.json();
  const best = data?.data?.[0];

  return json(200, {
    mxn: best ? Math.round(best.total_amount) : 0
  });
};