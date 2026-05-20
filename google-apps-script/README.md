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
