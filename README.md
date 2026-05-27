# AzA Gold

Web app และ Android app สำหรับติดตามราคาทองและพอร์ตทองสะสม

## Run Local

```bash
npm install
npm start
```

เปิดที่ `http://127.0.0.1:4173`

ต้องตั้ง Environment Variables ก่อนใช้งาน API:

```text
APP_USERNAME=
APP_PASSWORD=
AUTH_SECRET=
APPS_SCRIPT_URL=
GOOGLE_SHEET_ID=
HOLDINGS_GID=
DAILY_PRICES_GID=
CRON_SECRET=
```

## Render

โปรเจกต์นี้มี `render.yaml` สำหรับสร้าง Web Service บน Render แล้ว ให้ตั้งค่า Environment Variables ใน Render Dashboard เท่านั้น ห้ามใส่ค่าเหล่านี้ลงในโค้ด:

- `APP_USERNAME`
- `APP_PASSWORD`
- `AUTH_SECRET`
- `APPS_SCRIPT_URL`
- `GOOGLE_SHEET_ID`
- `HOLDINGS_GID`
- `DAILY_PRICES_GID`
- `CRON_SECRET`

หลัง deploy แล้ว Web App จะคุยกับ Render API ก่อนเสมอ และฝั่ง frontend/APK จะไม่เห็น Google Sheet ID หรือ Apps Script URL

Render backend จะพยายามอัพเดทราคาทองเข้า Sheet วันละ 4 เวลาใน timezone Asia/Bangkok:

```text
06:00, 12:00, 18:00, 24:00
```

หมายเหตุ: ถ้าใช้ Render plan ที่ service หลับได้ ควรสร้าง Render Cron Jobs เพิ่มให้เรียก endpoint นี้ตามเวลาข้างบนเพื่อความแน่นอน:

```text
GET /api/cron/update-price?token=CRON_SECRET&slot=06:00
GET /api/cron/update-price?token=CRON_SECRET&slot=12:00
GET /api/cron/update-price?token=CRON_SECRET&slot=18:00
GET /api/cron/update-price?token=CRON_SECRET&slot=24:00
```

## Google Apps Script

ไฟล์ Apps Script อยู่ที่ `google-apps-script/Code.gs`

ตั้ง Script Properties ใน Apps Script:

```text
SPREADSHEET_ID
HOLDINGS_GID
DAILY_PRICES_GID
```

จากนั้น deploy เป็น Web App แล้วนำ URL ไปใส่ใน Render env `APPS_SCRIPT_URL`

## Android APK

ไฟล์ debug APK ที่ build แล้วอยู่ที่:

```text
dist/aza-gold-debug.apk
```

Build ใหม่ได้ด้วย:

```bash
npm install
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
npm run android:apk
```

## Features

- Login ก่อนเข้าใช้งาน และคง session ไว้จนกด Logout
- ตัวเลือกจำชื่อบัญชีและรหัสผ่านในเครื่องผู้ใช้
- Dashboard ราคาทองวันนี้, น้ำหนักทองสะสม, และส่วนต่างจากราคาปัจจุบัน
- ราคาทองรายวันพร้อมตัวกรองเดือน/ปี ประวัติย้อนหลัง และรอบอัพเดท 06:00, 12:00, 18:00, 24:00
- เพิ่ม แก้ไข และลบรายการทองสะสม พร้อมซิงค์ Google Sheet ผ่าน Render
- ตั้งแจ้งเตือนขายรายรายการ เวลา 09.05 และ 12.00 น. ในวันที่กำหนด
- แจ้งเตือนสรุปราคาทองและส่วนต่างทุกวันเวลา 09.00 น.
- Forecast ระยะ 15 วัน, 1 เดือน, 3 เดือน, 6 เดือน, 1 ปี, 3 ปี, 5 ปี, 10 ปี พร้อมกราฟและตาราง
- กราฟแนวโน้มภายนอก 90 วันจาก CoinGecko PAX Gold แปลงเป็นราคาต่อทอง 1 บาทด้วย USD/THB
- Export/Import backup เป็น JSON

## Security Notes

- ห้ามฝากข้อมูลลับไว้ใน GitHub Pages หรือไฟล์ frontend เพราะผู้ใช้ดู source ได้เสมอ
- ถ้าเคย push Sheet ID หรือ Apps Script URL ไปแล้ว ควร rotate Apps Script deployment URL และปรับสิทธิ์ Sheet ให้เป็นส่วนตัว
- ปุ่มจำรหัสผ่านเก็บค่าไว้ในเครื่องของผู้ใช้เท่านั้น เหมาะกับเครื่องส่วนตัว
