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

- `gid=1394429920` สำหรับทองที่สะสม
  - Header: `ลำดับ,รายการ,จำนวนบาท,ราคาซื้อรวม,ราคาขายรวม,วันที่ซื้อ,แจ้งเตือนขาย,วันที่แจ้งเตือน`
- `gid=484644725` สำหรับราคาทองรายวัน
  - Header: `วันที่,เวลา,รับซื้อ,ขาย,แหล่งข้อมูล`

ถ้า Google Sheet ยังไม่มีแถวราคาของวันนี้ แอพจะดึงราคาสดโดยประมาณและบันทึกไว้ในเครื่องเป็น fallback เมื่อเปิดแอพ

### เขียนราคากลับเข้า Google Sheet

เว็บ/Android เขียนกลับเข้า Sheet ผ่าน Google Apps Script Web App นี้ ซึ่งฝังไว้ในแอพแล้ว:

```text
https://script.google.com/macros/s/AKfycbz62Dw-RJkEBuQ_7lzJEdqJQBGulf1Ro7iQ6WlLmwh0gB3fM9bXl5OCdI2qIVLhkqtm/exec
```

เมื่อ Google Sheet `gid=484644725` ยังไม่มีราคาของวันนี้ แอพจะดึงราคาสด fallback แล้วส่งเข้า Sheet แบบ upsert ตามวันที่ จึงไม่เพิ่มซ้ำเมื่อกด refresh หลายครั้ง

เมื่อเพิ่มหรือแก้ไข `ทองที่สะสม` แอพจะส่งเข้า Google Sheet `gid=1394429920` ผ่าน action `upsertHolding` โดยใช้คอลัมน์ `ลำดับ` เป็นตัวระบุแถว

หลังแก้ `google-apps-script/Code.gs` ต้อง deploy Web App version ใหม่ใน Apps Script เพื่อให้ endpoint เดิมรองรับ action ล่าสุด

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
