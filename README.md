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

## Features

- Dashboard ราคาทองวันนี้, น้ำหนักทองสะสม, และส่วนต่างจากราคาปัจจุบัน
- ราคาทองรายวันพร้อมประวัติย้อนหลัง
- เพิ่ม แก้ไข ลบ รายการทองสะสม โดยราคาซื้อ/ราคาขายเป็นยอดรวมของรายการนั้น
- ราคาขายในรายการสะสมเว้นว่างได้ และคำนวณส่วนต่างจากมูลค่าตามน้ำหนักทองจริงเมื่อมีราคาปัจจุบัน
- ตั้งแจ้งเตือนขายรายรายการ เวลา 09.05 และ 12.00 น. ในวันที่กำหนด
- แจ้งเตือนสรุปราคาทองและส่วนต่างทุกวันเวลา 09.00 น.
- Forecast ระยะ 15 วัน, 1 เดือน, 3 เดือน, 6 เดือน, 1 ปี, 3 ปี, 5 ปี, 10 ปี พร้อมกราฟและตาราง
- Export/Import backup เป็น JSON

## Notes

- ข้อมูลเก็บใน `localStorage` ของเบราว์เซอร์
- Notification ทำงานเมื่อเปิดแอพไว้ในเบราว์เซอร์ และต้องกดอนุญาต Notification ก่อน
- ราคาทองสดเป็นราคาไทยโดยประมาณจาก XAU/USD และ USD/THB ยังไม่ใช่ราคาประกาศสมาคมค้าทองคำโดยตรง
