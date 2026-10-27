// POST /api/admin → ตรวจ ADMIN_PASSWORD (Vercel env) แล้วส่งคำสั่งเขียนข้อมูลต่อไปยัง Apps Script พร้อมคีย์ลับ
const crypto = require('crypto');
const ALLOWED = new Set(['login', 'saveMonth', 'upsertWard']);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  const { ADMIN_PASSWORD, APPS_SCRIPT_URL, APPS_SCRIPT_KEY } = process.env;
  if (!ADMIN_PASSWORD) return res.status(500).json({ ok: false, error: 'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ใน Vercel Environment Variables' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' }); }

  if (typeof body.password !== 'string' || !crypto.timingSafeEqual(sha(body.password), sha(ADMIN_PASSWORD))) {
    await sleep(800); // ชะลอการเดารหัส
    return res.status(401).json({ ok: false, error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  if (!ALLOWED.has(body.action)) return res.status(400).json({ ok: false, error: 'unknown action' });
  if (body.action === 'login') return res.status(200).json({ ok: true });

  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_KEY) {
    return res.status(500).json({ ok: false, error: 'ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL / APPS_SCRIPT_KEY ใน Vercel Environment Variables' });
  }
  const { password, ...payload } = body;
  payload.key = APPS_SCRIPT_KEY;
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch {
      return res.status(502).json({ ok: false, error: 'Apps Script ไม่ได้ตอบเป็น JSON – ตรวจการ Deploy (เวอร์ชันล่าสุด, Anyone)' });
    }
    return res.status(200).json(json);
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
};
