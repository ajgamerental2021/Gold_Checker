# AzA Gold

Web app สำหรับติดตามราคาทองและพอร์ตทองสะสม

## Run

```bash
python3 -m http.server 4173
```

เปิดที่ `http://127.0.0.1:4173`

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

## Google Sheet Sync

แอพอ่านข้อมูลจาก Google Sheet นี้:

```text
https://docs.google.com/spreadsheets/d/1i-619OKgmIHnBWapurp-_VfAx0dqh_cgcJBo-FHdeXw/edit?usp=sharing
```

- `gid=0` สำหรับทองที่สะสม
  - Header: `ลำดับ,รายการ,จำนวนบาท,ราคาซื้อรวม,ราคาขายรวม,วันที่ซื้อ,แจ้งเตือนขาย,วันที่แจ้งเตือน`
- `gid=484644725` สำหรับราคาทองรายวัน
  - Header: `วันที่,เวลา,รับซื้อ,ขาย,แหล่งข้อมูล`

ถ้า Google Sheet ยังไม่มีแถวราคาของวันนี้ แอพจะดึงราคาสดโดยประมาณและบันทึกไว้ในเครื่องเป็น fallback เมื่อเปิดแอพ

### เขียนราคากลับเข้า Google Sheet

เว็บ/Android เขียนกลับเข้า Sheet ผ่าน Google Apps Script Web App:

1. เปิด Google Sheet แล้วไปที่ `Extensions > Apps Script`
2. วางโค้ดจาก `google-apps-script/Code.gs`
3. กด `Deploy > New deployment`
4. เลือกชนิด `Web app`
5. ตั้ง `Execute as` เป็นตัวคุณเอง
6. ตั้ง `Who has access` เป็น `Anyone`
7. Deploy แล้ว copy Web App URL

นำ URL มาเปิดแอพครั้งแรกแบบนี้เพื่อบันทึก endpoint ลงเครื่อง:

```text
http://127.0.0.1:4173/?sheetWriteUrl=YOUR_APPS_SCRIPT_WEB_APP_URL
```

หรือใส่ URL ถาวรใน `SHEET_WRITE_WEB_APP_URL` ที่ `app.js` แล้ว build APK ใหม่

เมื่อ Google Sheet `gid=484644725` ยังไม่มีราคาของวันนี้ แอพจะดึงราคาสด fallback แล้วส่งเข้า Sheet แบบ upsert ตามวันที่ จึงไม่เพิ่มซ้ำเมื่อกด refresh หลายครั้ง

## Features

- Dashboard ราคาทองวันนี้, น้ำหนักทองสะสม, และส่วนต่างจากราคาปัจจุบัน
- ราคาทองรายวันพร้อมประวัติย้อนหลัง
- เพิ่มและแก้ไขรายการทองสะสม โดยราคาซื้อ/ราคาขายเป็นยอดรวมของรายการนั้น
- ราคาขายในรายการสะสมเว้นว่างได้ และคำนวณส่วนต่างจากมูลค่าตามน้ำหนักทองจริงเมื่อมีราคาปัจจุบัน
- ตั้งแจ้งเตือนขายรายรายการ เวลา 09.05 และ 12.00 น. ในวันที่กำหนด
- แจ้งเตือนสรุปราคาทองและส่วนต่างทุกวันเวลา 09.00 น.
- Forecast ระยะ 15 วัน, 1 เดือน, 3 เดือน, 6 เดือน, 1 ปี, 3 ปี, 5 ปี, 10 ปี พร้อมกราฟและตาราง
- Export/Import backup เป็น JSON

## Notes

- ข้อมูลเก็บใน `localStorage` ของเบราว์เซอร์
- Notification ทำงานเมื่อเปิดแอพไว้ในเบราว์เซอร์ และต้องกดอนุญาต Notification ก่อน
- ราคาทองสดเป็นราคาไทยโดยประมาณจาก XAU/USD และ USD/THB ยังไม่ใช่ราคาประกาศสมาคมค้าทองคำโดยตรง
