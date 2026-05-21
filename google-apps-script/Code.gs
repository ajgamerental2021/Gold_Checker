const HOLDING_HEADERS = ["ลำดับ", "รายการ", "จำนวนบาท", "ราคาซื้อรวม", "ราคาขายรวม", "วันที่ซื้อ", "แจ้งเตือนขาย", "วันที่แจ้งเตือน"];
const DAILY_PRICE_HEADERS = ["วันที่", "เวลา", "รับซื้อ", "ขาย", "แหล่งข้อมูล"];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    return handlePayload_(payload);
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage_(error) });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.payload) {
    try {
      return handlePayload_(JSON.parse(e.parameter.payload));
    } catch (error) {
      return jsonResponse({ ok: false, error: errorMessage_(error) });
    }
  }

  return jsonResponse({ ok: true, app: "AzA Gold Sheet API" });
}

function handlePayload_(payload) {
  if (payload.action === "readAll") {
    return readAll_();
  }

  if (payload.action === "upsertDailyPrice") {
    return upsertDailyPrice_(payload.record || {});
  }

  if (payload.action === "upsertHolding") {
    return upsertHolding_(payload.record || {});
  }

  if (payload.action === "deleteHolding") {
    return deleteHolding_(payload.record || {});
  }

  return jsonResponse({ ok: false, error: "Unknown action" });
}

function readAll_() {
  try {
    const holdingsSheet = sheetByGid_(holdingGid_());
    const pricesSheet = sheetByGid_(dailyPricesGid_());
    ensureHeaders_(holdingsSheet, HOLDING_HEADERS);
    ensureHeaders_(pricesSheet, DAILY_PRICE_HEADERS);

    return jsonResponse({
      ok: true,
      action: "readAll",
      holdings: rowsToObjects_(holdingsSheet),
      prices: rowsToObjects_(pricesSheet),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage_(error) });
  }
}

function upsertDailyPrice_(record) {
  try {
    const sheet = sheetByGid_(dailyPricesGid_());
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

    return jsonResponse({ ok: true, action: "upsertDailyPrice", row: rowIndex > 0 ? rowIndex : sheet.getLastRow() });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage_(error) });
  }
}

function upsertHolding_(record) {
  try {
    const sheet = sheetByGid_(holdingGid_());
    ensureHeaders_(sheet, HOLDING_HEADERS);
    const sequence = record.sequence || nextSequence_(sheet);
    const rowIndex = findRowByValue_(sheet, 1, sequence);
    const values = [
      sequence,
      record.name || "",
      Number(record.weightBaht) || 0,
      Number(record.buyPrice) || 0,
      record.sellPrice === null || record.sellPrice === undefined || record.sellPrice === "" ? "" : Number(record.sellPrice),
      record.purchaseDate || "",
      record.notifySell ? "ใช่" : "ไม่",
      record.notifyDate || "",
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return jsonResponse({ ok: true, action: "upsertHolding", sequence: sequence, row: rowIndex > 0 ? rowIndex : sheet.getLastRow() });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage_(error) });
  }
}

function deleteHolding_(record) {
  try {
    const sheet = sheetByGid_(holdingGid_());
    ensureHeaders_(sheet, HOLDING_HEADERS);
    const rowIndex = findRowByValue_(sheet, 1, record.sequence);

    if (rowIndex < 0) {
      return jsonResponse({ ok: true, action: "deleteHolding", deleted: false, sequence: record.sequence, message: "Holding sequence not found" });
    }

    sheet.deleteRow(rowIndex);
    return jsonResponse({ ok: true, action: "deleteHolding", deleted: true, sequence: record.sequence, row: rowIndex });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage_(error) });
  }
}

function sheetByGid_(gid) {
  const spreadsheet = SpreadsheetApp.openById(scriptProperty_("SPREADSHEET_ID"));
  const sheet = spreadsheet.getSheets().find((candidate) => candidate.getSheetId() === gid);
  if (!sheet) throw new Error("Sheet gid not found: " + gid);
  return sheet;
}

function scriptProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error("Missing Script Property: " + key);
  return value;
}

function holdingGid_() {
  return Number(scriptProperty_("HOLDINGS_GID"));
}

function dailyPricesGid_() {
  return Number(scriptProperty_("DAILY_PRICES_GID"));
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => String(current[index] || "").trim() === header);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function rowsToObjects_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getDisplayValues();
  const headers = values[0].map((header) => String(header || "").trim());
  return values.slice(1).map((row) =>
    headers.reduce((object, header, index) => {
      object[header] = String(row[index] || "").trim();
      return object;
    }, {}),
  );
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

function findRowByValue_(sheet, column, value) {
  if (!value || sheet.getLastRow() < 2) return -1;
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0]).trim() === String(value).trim()) {
      return index + 2;
    }
  }
  return -1;
}

function nextSequence_(sheet) {
  if (sheet.getLastRow() < 2) return "1";
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  const max = values.reduce((currentMax, row) => {
    const numeric = Number(row[0]);
    return Math.max(currentMax, Number.isFinite(numeric) ? numeric : 0);
  }, 0);
  return String(max + 1);
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

function errorMessage_(error) {
  return String(error && error.message ? error.message : error);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
