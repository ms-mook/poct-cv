// ตั้งค่าฝั่งเว็บ – ไม่มีความลับในไฟล์นี้
// API_BASE = ที่อยู่ API บน Vercel (/api/data, /api/admin) · ตัวแปรลับตั้งที่ Vercel > Settings > Environment Variables
// เว้นว่าง "" เพื่อดูข้อมูลสำรองจาก data/seed.json (ใช้ตอนเปิดไฟล์ในเครื่อง)
window.APP_CONFIG = {
  API_BASE: "/api",
  THRESHOLD_DEFAULT: 6.7
};
