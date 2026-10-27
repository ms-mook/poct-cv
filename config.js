// ตั้งค่าหลังจาก Deploy Google Apps Script เป็น Web app แล้ว
// วาง URL ที่ลงท้ายด้วย /exec ตรงนี้ (ดูขั้นตอนใน README.md)
// ถ้าเว้นว่าง เว็บจะแสดงข้อมูลสำรองจาก data/seed.json (ข้อมูล Excel ปี 2568–2569) และหน้า admin จะบันทึกไม่ได้
window.APP_CONFIG = {
  API_URL: "",
  THRESHOLD_DEFAULT: 6.7
};
