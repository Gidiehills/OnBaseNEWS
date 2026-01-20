// api/health.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: {
      CRYPTO_PANIC_KEY: !!process.env.CRYPTO_PANIC_KEY,
      NEWSDATA_KEY: !!process.env.NEWSDATA_KEY,
      GROQ_API_KEY: !!process.env.GROQ_API_KEY
    }
  });
}

