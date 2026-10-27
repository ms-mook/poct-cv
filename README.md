# ระบบติดตาม %CV POCT Glucose – รพ.ศรีนครินทร์

เว็บ dashboard ติดตามค่า %CV ของการทำ IQC (L1 / L2) เครื่อง ACCU-Chek Inform II แยกตามหอผู้ป่วย
เกณฑ์ผ่าน: **%CV < 6.7** (แก้ได้ที่ชีต `Config` → `cv_threshold`)

```
Google Sheet (ฐานข้อมูล)  ←→  Apps Script Web app (API + รหัสผ่าน admin)  ←→  เว็บ static บน Vercel
```

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` + `js/dashboard.js` | Dashboard: (1) แท่งร้อยละที่ผ่านต่อเดือน (2) กราฟเส้น %CV รายหอ (3) ตารางรายละเอียด + กดดูรายหอ, ตัวกรอง L1 / L2 / รวม |
| `admin.html` + `js/admin.js` | หน้า admin: ฟอร์มบันทึก/แก้ไข %CV รายเดือน (วางจาก Excel ได้), เพิ่ม/แก้ไขหอและเครื่อง |
| `apps-script/Code.gs` | Backend ที่ผูกกับ Google Sheet |
| `config.js` | ใส่ URL ของ Apps Script (`API_URL`) |
| `data/seed.json` | ข้อมูลสำรอง (Excel ปี 2568–2569) ใช้แสดงผลเมื่อยังไม่ได้ตั้งค่า API |
| `tools/convert.py` | สคริปต์แปลง Excel รายปี → ข้อมูลแบบ long (ใช้ซ้ำได้) |

## ขั้นตอนติดตั้ง (ทำครั้งเดียว ~10 นาที)

### 1) Google Sheet
ใช้ชีต **"POCT Glucose %CV – รพ.ศรีนครินทร์ (ฐานข้อมูล)"** ที่สร้างไว้แล้ว มี 3 ชีต
- `Data` – 1 แถว = 1 เครื่อง × 1 เดือน: `month` (YYYY-MM ค.ศ.), `device`, `L1`, `L2`, `note`, `updated_at`
- `Wards` – `no`, `ward`, `device`, `active`
- `Config` – `cv_threshold = 6.7`

### 2) Apps Script (backend)
1. เปิดชีต → เมนู **ส่วนขยาย > Apps Script**
2. ลบโค้ดเดิม แล้ววางเนื้อหาไฟล์ `apps-script/Code.gs` → บันทึก
3. เลือกฟังก์ชัน `setup` → **Run** → อนุญาตสิทธิ์ (ครั้งแรก)
4. **Project Settings (⚙) > Script properties > Add**: `ADMIN_PASSWORD` = รหัสผ่านที่ต้องการ
5. **Deploy > New deployment > Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด Deploy แล้วคัดลอก URL ที่ลงท้ายด้วย `/exec`

> แก้โค้ด Code.gs ภายหลัง ต้อง **Deploy > Manage deployments > Edit > New version** ด้วย URL จึงจะใช้โค้ดใหม่

### 3) ตั้งค่าเว็บ
แก้ `config.js`
```js
window.APP_CONFIG = { API_URL: "https://script.google.com/macros/s/xxxxxxxx/exec", THRESHOLD_DEFAULT: 6.7 };
```

### 4) GitHub + Vercel
```bash
git init && git add . && git commit -m "POCT CV dashboard"
git remote add origin https://github.com/<user>/<repo>.git && git push -u origin main
```
Vercel → **Add New > Project** → เลือก repo → Framework Preset: **Other**, ไม่ต้องมี Build command / Output directory → Deploy
- Dashboard: `https://<project>.vercel.app/`
- Admin: `https://<project>.vercel.app/admin`

## วิธีใช้งานประจำเดือน
1. เข้า `/admin` ใส่รหัสผ่าน
2. เลือกเดือน (ค่าเริ่มต้นคือเดือนถัดจากเดือนล่าสุดที่มีข้อมูล)
3. กรอก L1/L2 ของแต่ละเครื่อง หรือคัดลอก 2 คอลัมน์ (L1, L2) จาก Excel มาวางที่ช่อง L1 แถวแรก
4. เครื่องที่ปิดปรับปรุง/ไม่ได้ตรวจ ให้ติ๊ก "ปิด/ไม่ได้ตรวจ"
5. กด **บันทึก** – ข้อมูลเข้า Google Sheet และ dashboard อัปเดตทันที (เลือกเดือนเดิมเพื่อแก้ไขได้)

ปีงบประมาณใหม่ไม่ต้องตั้งค่า: ระบบคำนวณจากเดือน (ต.ค.–ก.ย., พ.ศ. = ค.ศ. ของเดือนที่ ≥ ต.ค. + 1 + 543)
หอ/เครื่องใหม่: แท็บ "หอผู้ป่วย / เครื่อง" → เพิ่มแล้วจะปรากฏในฟอร์มรายเดือนทันที

## นิยามการนับ "ผ่านเกณฑ์"
- ผ่าน = %CV **< 6.7** (เท่ากับ 6.7 ถือว่าไม่ผ่าน)
- L1 / L2 = นับเฉพาะระดับนั้น · **รวม** = เครื่องผ่านเมื่อ **ทั้ง L1 และ L2** ผ่านพร้อมกัน
- ร้อยละ = เครื่องที่ผ่าน ÷ เครื่องที่มีข้อมูลในเดือนนั้น (เดือนที่ปิดปรับปรุง/ไม่มีค่า ไม่นับในตัวหาร)

## หมายเหตุข้อมูลที่แปลงจาก Excel
- 67 หอ/เครื่อง × 24 เดือน (ต.ค. 67 – ก.ย. 69) = 1,608 แถว
- พบค่าพิมพ์ผิดในต้นฉบับ 2 จุด แก้เป็นค่าที่น่าจะถูกและใส่หมายเหตุในคอลัมน์ `note`: `6..64` → 6.64 (PICU มี.ค. 68, L1) และ `1..17` → 1.17 (สว.9A(2) มิ.ย. 69, L2) **โปรดตรวจกับใบรายงานจริง**
- เซลล์ "ปิดปรับปรุงหอผู้ป่วย" เก็บเป็นค่าว่าง + หมายเหตุ

## ความปลอดภัย
- รหัสผ่านแอดมินเก็บใน Script properties เท่านั้น (ไม่อยู่ในโค้ดเว็บ/ชีต) และตรวจที่ฝั่ง Apps Script ทุกครั้งที่บันทึก
- การอ่านข้อมูล dashboard เปิดสาธารณะผ่าน URL `/exec` (ใครมีลิงก์อ่านได้) – ข้อมูลเป็นค่า QC รายหอ ไม่มีข้อมูลผู้ป่วย
- ถ้าต้องจำกัดผู้เข้าชม ให้เปิด Vercel Authentication / Password Protection ที่ตัวโปรเจกต์
