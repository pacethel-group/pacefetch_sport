// /api/track.js — Put this in /api/track.js (Vercel)
// Tracks every real visitor with country/state
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { page = '/', country = 'NG', state = 'Lagos' } = req.query;
  const today = new Date().toISOString().split('T')[0];

  try {
    await kv.incr('visitors:' + today);
    await kv.hincrby('countries:' + today, country, 1);
    if (country === 'NG') {
      await kv.hincrby('states:' + today, state, 1);
    }
    if (page) {
      await kv.hincrby('pages:' + today, page, 1);
    }
    await kv.lpush('recent', { country, page, ts: Date.now(), state });
    await kv.ltrim('recent', 0, 99);
    
    // live counter expires in 5 min
    await kv.incr('live:count');
    await kv.expire('live:count', 300);

    return res.status(200).json({ ok: true, today, country, state, page });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
