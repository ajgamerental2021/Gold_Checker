# AzA Gold Google Apps Script

ใช้ `Code.gs` เป็น Web App สำหรับให้ AzA Gold เขียนราคาทอง fallback กลับเข้า Google Sheet

Deploy:

1. เปิด Google Sheet
2. ไปที่ `Extensions > Apps Script`
3. วางโค้ดจาก `Code.gs`
4. `Deploy > New deployment`
5. เลือก `Web app`
6. `Execute as`: Me
7. `Who has access`: Anyone
8. Copy Web App URL ไปใช้กับแอพ

การทำงาน:

- รับ `GET ?payload=...` หรือ `POST` action `upsertDailyPrice`
- เขียนลง sheet `gid=484644725`
- หาแถวจากคอลัมน์ `วันที่`
- ถ้ามีวันที่เดิมจะอัพเดทแถวนั้น
- ถ้าไม่มีจะ append แถวใหม่
- รับ `GET ?payload=...` หรือ `POST` action `upsertHolding`
- เขียนลง sheet `gid=1394429920`
- หาแถวจากคอลัมน์ `ลำดับ`
- ถ้ามีลำดับเดิมจะอัพเดทแถวนั้น
- ถ้าไม่มีจะ append แถวใหม่
- รับ `GET ?payload=...` หรือ `POST` action `deleteHolding`
- ลบรายการทองสะสมจาก sheet `gid=1394429920` โดยอิงคอลัมน์ `ลำดับ`

หลังแก้ `Code.gs` ต้องไปที่ `Deploy > Manage deployments > Edit > New version > Deploy` เพื่อให้ URL เดิมใช้โค้ดล่าสุด

วิธีเช็กว่า URL เป็นเวอร์ชันล่าสุดแล้ว:

1. เปิด URL นี้ โดยเปลี่ยน `WEB_APP_URL` เป็น URL ของ Apps Script
   `WEB_APP_URL?payload=%7B%22action%22%3A%22deleteHolding%22%2C%22record%22%3A%7B%22sequence%22%3A%22__probe__%22%7D%7D`
2. ถ้าถูกต้องต้องเห็น JSON ที่มี `action:"deleteHolding"` และ `deleted`
3. ถ้ายังเห็นแค่ `{"ok":true,"app":"AzA Gold Sheet Writer"}` แปลว่ายังไม่ได้ deploy เป็น New version
