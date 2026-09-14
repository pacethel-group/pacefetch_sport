// /api/stats.js — Put this in /api/stats.js in your repo (Vercel)
// npm i @vercel/kv  and create KV database in Vercel Dashboard → Storage → KV
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const visitors = (await kv.get('visitors:' + today)) || 0;
    const live = (await kv.get('live:count')) || 0;
    const countries = (await kv.hgetall('countries:' + today)) || {};
    const states = (await kv.hgetall('states:' + today)) || {};
    const pages = (await kv.hgetall('pages:' + today)) || {};
    const recent = (await kv.lrange('recent', 0, 9)) || [];
    
    const last7d = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const v = (await kv.get('visitors:' + ds)) || 0;
      last7d.push({ date: ds, visitors: v });
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({
      today: visitors,
      live,
      pages,
      countries,
      states,
      recent,
      last7d,
      source: 'Vercel KV LIVE'
    });
  } catch (e) {
    return res.status(200).json({
      today: 0,
      live: 0,
      pages: {},
      countries: {},
      states: {},
      recent: [],
      last7d: [],
      error: e.message
    });
  }
}
