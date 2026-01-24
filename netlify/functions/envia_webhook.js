const { jsonResponse, supabaseAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, {});

  try {
    const payload = JSON.parse(event.body);
    const tracking = payload.tracking_number || payload.trackingNumber;
    const status = payload.status || payload.carrier_status;

    if (tracking && status && supabaseAdmin) {
        await supabaseAdmin
            .from('orders')
            .update({ delivery_status: status, last_update: new Date() })
            .eq('tracking_number', tracking);
    }

    return jsonResponse(200, { received: true });
  } catch (error) {
    return jsonResponse(400, { error: 'Bad Request' });
  }
};