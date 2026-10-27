// POST /api/admin → ตรวจ ADMIN_PASSWORD (Vercel env) แล้วส่งคำสั่งเขียนข้อมูลต่อไปยัง Apps Script พร้อมคีย์ลับ
const crypto = require('crypto');
const ALLOWED = new Set(['login', 'saveMonth', 'upsertWard', 'history']);
// จำกัดการเดารหัส: ผิดครบ MAX_FAILS ครั้งภายใน WINDOW → ล็อก IP นั้น LOCK_MS (เก็บในหน่วยความจำของ instance – best effort)
const FAILS = new Map(); const MAX_FAILS = 5, WINDOW = 15 * 60e3, LOCK_MS = 15 * 60e3;
const ipOf = (req) => String((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')).split(',')[0].trim();
function lockLeft(ip) { const f = FAILS.get(ip); if (!f) return 0; if (f.until && f.until > Date.now()) return f.until - Date.now(); if (Date.now() - f.first > WINDOW) FAILS.delete(ip); return 0; }
function noteFail(ip) { const now = Date.now(); let f = FAILS.get(ip); if (!f || now - f.first > WINDOW) f = { n: 0, first: now }; f.n++; if (f.n >= MAX_FAILS) f.until = now + LOCK_MS; FAILS.set(ip, f); if (FAILS.size > 500) FAILS.clear(); }
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
/** ADMIN_USERS="mook:รหัส1,somchai:รหัส2" (ชื่อไม่สนตัวพิมพ์ใหญ่เล็ก) · รองรับ ADMIN_PASSWORD เดิม = ผู้ใช้ชื่อ admin */
function parseUsers() {
  const m = new Map();
  String(process.env.ADMIN_USERS || '').split(',').forEach((pair) => {
    const i = pair.indexOf(':'); if (i < 1) return;
    const u = pair.slice(0, i).trim().toLowerCase(), p = pair.slice(i + 1).trim();
    if (u && p) m.set(u, p);
  });
  if (!m.size && process.env.ADMIN_PASSWORD) m.set('admin', process.env.ADMIN_PASSWORD);
  return m;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  const { APPS_SCRIPT_URL, APPS_SCRIPT_KEY } = process.env;
  const users = parseUsers();
  if (!users.size) return res.status(500).json({ ok: false, error: 'ยังไม่ได้ตั้งค่า ADMIN_USERS (หรือ ADMIN_PASSWORD) ใน Vercel Environment Variables' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' }); }

  const ip = ipOf(req), left = lockLeft(ip);
  if (left > 0) return res.status(429).json({ ok: false, error: `ลองรหัสผ่านผิดหลายครั้ง – กรุณารอ ${Math.ceil(left / 60000)} นาทีแล้วลองใหม่` });
  // ผู้ใช้หลายคน: ADMIN_USERS="ชื่อ1:รหัส1,ชื่อ2:รหัส2" · ถ้าไม่ได้ส่งชื่อมาและมีผู้ใช้คนเดียว (ADMIN_PASSWORD เดิม) ใช้ชื่อ admin
  const uname = String(body.username || (users.size === 1 ? [...users.keys()][0] : '')).trim().toLowerCase();
  const real = users.get(uname);
  const okPw = typeof body.password === 'string' && crypto.timingSafeEqual(sha(body.password), sha(real === undefined ? '\u0000no-user' : real));
  if (!okPw || real === undefined) {
    noteFail(ip); await sleep(800); // ชะลอการเดารหัส
    return res.status(401).json({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  FAILS.delete(ip);
  if (!ALLOWED.has(body.action)) return res.status(400).json({ ok: false, error: 'unknown action' });
  if (body.action === 'login') return res.status(200).json({ ok: true, user: uname });

  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_KEY) {
    return res.status(500).json({ ok: false, error: 'ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL / APPS_SCRIPT_KEY ใน Vercel Environment Variables' });
  }
  const { password, username, ...payload } = body;
  payload.key = APPS_SCRIPT_KEY;
  payload.user = uname;                 // ใช้บันทึกในชีต Log ว่าใครแก้
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
