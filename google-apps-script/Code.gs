const SPREADSHEET_ID = "1i-619OKgmIHnBWapurp-_VfAx0dqh_cgcJBo-FHdeXw";
const DAILY_PRICES_GID = 484644725;
const DAILY_PRICE_HEADERS = ["วันที่", "เวลา", "รับซื้อ", "ขาย", "แหล่งข้อมูล"];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (payload.action !== "upsertDailyPrice") {
      return jsonResponse({ ok: false, error: "Unknown action" });
    }

    const record = payload.record || {};
    const sheet = sheetByGid_(DAILY_PRICES_GID);
    ensureHeaders_(sheet, DAILY_PRICE_HEADERS);
    const rowIndex = findRowByDate_(sheet, record.date);
    const values = [
      record.date || "",
      record.time || "",
      Number(record.buy) || 0,
      Number(record.sell) || 0,
      record.source || "AzA Gold fallback",
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return jsonResponse({ ok: true, row: rowIndex > 0 ? rowIndex : sheet.getLastRow() });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, app: "AzA Gold Sheet Writer" });
}

function sheetByGid_(gid) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheets().find((candidate) => candidate.getSheetId() === gid);
  if (!sheet) throw new Error("Sheet gid not found: " + gid);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => String(current[index] || "").trim() === header);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function findRowByDate_(sheet, dateText) {
  if (!dateText || sheet.getLastRow() < 2) return -1;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (normalizeDate_(values[index][0]) === normalizeDate_(dateText)) {
      return index + 2;
    }
  }
  return -1;
}

function normalizeDate_(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return [iso[1], pad_(iso[2]), pad_(iso[3])].join("-");

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year > 2400) year -= 543;
    if (year < 100) year += 2000;
    return [year, pad_(slash[2]), pad_(slash[1])].join("-");
  }

  return text;
}

function pad_(value) {
  return String(value).padStart(2, "0");
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
