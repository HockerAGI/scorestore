'use strict';

const { supabaseAdmin, jsonResponse, handleOptions, readJsonFile } = require('./_shared');

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    const optionsRes = handleOptions({ headers: req.headers });
    Object.keys(optionsRes.headers || {}).forEach(key => res.setHeader(key, optionsRes.headers[key]));
    res.status(optionsRes.statusCode).send(optionsRes.body);
    return;
  }

  if (req.method !== 'GET') {
    const response = jsonResponse(405, { ok: false, error: 'Method not allowed' }, origin);
    Object.keys(response.headers || {}).forEach(key => res.setHeader(key, response.headers[key]));
    res.status(response.statusCode).send(response.body);
    return;
  }

  try {
    const sb = supabaseAdmin();

    if (!sb) {
      const fallback = readJsonFile('data/promos.json') || { rules: [] };
      const response = jsonResponse(200, {
        ok: true,
        rules: fallback.rules || [],
        message: 'Supabase not configured. Using local fallback.',
        count: (fallback.rules || []).length,
        source: 'local'
      }, origin);
      Object.keys(response.headers || {}).forEach(key => res.setHeader(key, response.headers[key]));
      res.status(response.statusCode).send(response.body);
      return;
    }

    const { data: rules, error } = await sb
      .from('promo_rules')
      .select('code,type,value,description,active,min_amount_mxn,expires_at,created_at')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[promos] Supabase error:', error?.message);
      const fallback = readJsonFile('data/promos.json') || { rules: [] };
      const response = jsonResponse(200, {
        ok: true,
        rules: fallback.rules || [],
        message: 'Could not fetch promos from database. Using local fallback.',
        count: (fallback.rules || []).length,
        source: 'local'
      }, origin);
      Object.keys(response.headers || {}).forEach(key => res.setHeader(key, response.headers[key]));
      res.status(response.statusCode).send(response.body);
      return;
    }

    const response = jsonResponse(200, {
      ok: true,
      rules: rules || [],
      count: (rules || []).length,
      source: 'database'
    }, origin);
    Object.keys(response.headers || {}).forEach(key => res.setHeader(key, response.headers[key]));
    res.status(response.statusCode).send(response.body);
  } catch (e) {
    console.error('[promos] error:', e?.message);
    const fallback = readJsonFile('data/promos.json') || { rules: [] };
    const response = jsonResponse(200, {
      ok: true,
      rules: fallback.rules || [],
      message: 'Error fetching promos. Using local fallback.',
      count: (fallback.rules || []).length,
      source: 'local'
    }, origin);
    Object.keys(response.headers || {}).forEach(key => res.setHeader(key, response.headers[key]));
    res.status(response.statusCode).send(response.body);
  }
};