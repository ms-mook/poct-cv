// GET /api/data → อ่านข้อมูลจาก Google Sheet ผ่าน Apps Script (ฝั่งเซิร์ฟเวอร์ ไม่เปิดเผย URL/คีย์ให้เบราว์เซอร์)
module.exports = async (req, res) => {
  const base = process.env.APPS_SCRIPT_URL, key = process.env.APPS_SCRIPT_KEY;
  if (!base || !key) {
    return res.status(500).json({ ok: false, error: 'ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL / APPS_SCRIPT_KEY ใน Vercel Environment Variables' });
  }
  try {
    const url = base + (base.includes('?') ? '&' : '?') + 'action=data&key=' + encodeURIComponent(key);
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch {
      return res.status(502).json({ ok: false, error: 'Apps Script ไม่ได้ตอบเป็น JSON – ตรวจว่า Deploy เป็น Web app (Who has access = Anyone) และ URL ลงท้าย /exec' });
    }
    if (!json.ok) return res.status(502).json({ ok: false, error: json.error || 'Apps Script error' });
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(200).json(json);
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
};
