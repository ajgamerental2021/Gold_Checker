const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = __dirname;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 365 * 20;
const THAI_GOLD_BAHT_GRAMS = 15.244;
const TROY_OUNCE_GRAMS = 31.1034768;
const GOLD_PURITY = 0.965;
const PRICE_UPDATE_TIMES = ["06:00", "12:00", "18:00", "24:00"];
const PRICE_UPDATE_WINDOW_MINUTES = 10;
const HOLDING_HEADERS = ["ลำดับ", "รายการ", "จำนวนบาท", "ราคาซื้อรวม", "ราคาขายรวม", "วันที่ซื้อ", "แจ้งเตือนขาย", "วันที่แจ้งเตือน"];
const DAILY_PRICE_HEADERS = ["วันที่", "เวลา", "รับซื้อ", "ขาย", "แหล่งข้อมูล"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`AzA Gold server listening on ${PORT}`);
  startPriceScheduler();
});

async function handleApi(req, res, url) {
  sendCors(res);

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, app: "AzA Gold API" });
    return;
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = await readJson(req);
    if (safeEqual(body.username, requiredEnv("APP_USERNAME")) && safeEqual(body.password, requiredEnv("APP_PASSWORD"))) {
      sendJson(res, 200, { ok: true, token: signToken({ username: body.username }) });
      return;
    }
    sendJson(res, 401, { ok: false, error: "Invalid username or password" });
    return;
  }

  if (url.pathname === "/api/cron/update-price" && ["GET", "POST"].includes(req.method)) {
    if (!isValidCronRequest(req, url)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized cron request" });
      return;
    }
    const slot = scheduledPriceSlot(url.searchParams.get("slot"));
    const recordDate = url.searchParams.get("date") || defaultDateForSlot(slot);
    const record = await updateGoldPriceAtSlot(recordDate, slot, "Render scheduled update");
    sendJson(res, 200, { ok: true, record });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  if (url.pathname === "/api/session" && req.method === "GET") {
    sendJson(res, 200, { ok: true, username: session.username });
    return;
  }

  if (url.pathname === "/api/data" && req.method === "GET") {
    const data = await readSheetData();
    sendJson(res, 200, { ok: true, ...data });
    return;
  }

  if (url.pathname === "/api/prices" && req.method === "POST") {
    const record = await readJson(req);
    const result = await callAppsScript("upsertDailyPrice", record);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (url.pathname === "/api/holdings" && req.method === "POST") {
    const record = await readJson(req);
    const result = await callAppsScript("upsertHolding", record);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/holdings\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const result = await callAppsScript("deleteHolding", { sequence: decodeURIComponent(deleteMatch[1]) });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

function startPriceScheduler() {
  if (env("ENABLE_PRICE_SCHEDULER") === "0") return;
  setTimeout(runScheduledPriceUpdateIfDue, 5000);
  setInterval(runScheduledPriceUpdateIfDue, 60 * 1000);
}

let scheduledPriceUpdateInFlight = false;
const scheduledPriceUpdateLog = new Set();

async function runScheduledPriceUpdateIfDue() {
  if (scheduledPriceUpdateInFlight) return;
  const slot = currentBangkokSlot();
  if (!slot) return;

  const key = `${slot.date}-${slot.time}`;
  if (scheduledPriceUpdateLog.has(key)) return;
  scheduledPriceUpdateLog.add(key);
  scheduledPriceUpdateInFlight = true;

  try {
    const record = await updateGoldPriceAtSlot(slot.date, slot.time, "Render scheduled update");
    console.log(`Updated scheduled gold price ${record.date} ${record.time}`);
  } catch (error) {
    scheduledPriceUpdateLog.delete(key);
    console.error(`Scheduled gold price update failed: ${error.message}`);
  } finally {
    scheduledPriceUpdateInFlight = false;
  }
}

async function updateGoldPriceAtSlot(date, time, sourcePrefix) {
  const live = await fetchLiveThaiGoldPrice(date, time, sourcePrefix);
  await callAppsScript("upsertDailyPrice", live);
  return live;
}

async function fetchLiveThaiGoldPrice(date, time, sourcePrefix) {
  const gold = await fetchGoldSpotUsd();
  const fx = await fetchUsdThbRate();
  const spotUsd = Number(gold.price);
  const thbRate = Number(fx.rate);
  if (!spotUsd || !thbRate) throw new Error("Live price payload missing");

  const estimatedThaiBaht = spotUsd * thbRate * (THAI_GOLD_BAHT_GRAMS / TROY_OUNCE_GRAMS) * GOLD_PURITY;
  const sell = roundToNearest(estimatedThaiBaht, 50);
  const buy = Math.max(0, sell - 100);

  return {
    date,
    time,
    buy,
    sell,
    spotUsd,
    thbRate,
    source: `${sourcePrefix} · ${gold.source}`,
    createdAt: new Date().toISOString(),
    updatedAt: gold.updatedAt || fx.updatedAt || new Date().toISOString(),
  };
}

async function fetchGoldSpotUsd() {
  const providers = [
    async () => {
      const data = await fetchJson("https://api.gold-api.com/price/XAU");
      return {
        price: Number(data.price),
        source: "Gold API estimate",
        updatedAt: data.updatedAt,
      };
    },
    async () => {
      const data = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold,tether-gold&vs_currencies=usd");
      const prices = [data["pax-gold"]?.usd, data["tether-gold"]?.usd].map(Number).filter(Boolean);
      return {
        price: prices.reduce((sum, price) => sum + price, 0) / prices.length,
        source: "CoinGecko estimate",
        updatedAt: new Date().toISOString(),
      };
    },
  ];
  return firstSuccessful(providers, "gold spot");
}

async function fetchUsdThbRate() {
  const providers = [
    async () => {
      const data = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=THB");
      return {
        rate: Number(data.rates?.THB),
        updatedAt: data.date ? `${data.date}T00:00:00Z` : new Date().toISOString(),
      };
    },
    async () => {
      const data = await fetchJson("https://open.er-api.com/v6/latest/USD");
      return {
        rate: Number(data.rates?.THB),
        updatedAt: data.time_last_update_utc,
      };
    },
  ];
  return firstSuccessful(providers, "USD/THB");
}

async function firstSuccessful(providers, label) {
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await provider();
      if (Object.values(result).some((value) => Number.isNaN(value))) {
        throw new Error(`Invalid ${label} payload`);
      }
      return result;
    } catch (error) {
      errors.push(error);
    }
  }
  throw new Error(`Cannot fetch ${label}: ${errors.map((error) => error.message).join("; ")}`);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function currentBangkokSlot(date = new Date()) {
  const parts = bangkokParts(date);
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  for (const time of PRICE_UPDATE_TIMES) {
    const slotMinute = time === "24:00" ? 0 : timeToMinutes(time);
    if (minuteOfDay >= slotMinute && minuteOfDay < slotMinute + PRICE_UPDATE_WINDOW_MINUTES) {
      return {
        date: time === "24:00" ? bangkokDateOffset(date, -1) : parts.date,
        time,
      };
    }
  }
  return null;
}

function scheduledPriceSlot(value) {
  const time = normalizeTime(value || "");
  return PRICE_UPDATE_TIMES.includes(time) ? time : currentBangkokSlot()?.time || bangkokNowTime();
}

function defaultDateForSlot(slot) {
  return slot === "24:00" ? bangkokDateOffset(new Date(), -1) : bangkokParts(new Date()).date;
}

function isValidCronRequest(req, url) {
  const secret = env("CRON_SECRET");
  if (!secret) return false;
  const header = req.headers["x-cron-secret"] || "";
  const token = url.searchParams.get("token") || "";
  return safeEqual(header, secret) || safeEqual(token, secret);
}

function bangkokParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function bangkokDateOffset(date, offsetDays) {
  return bangkokParts(new Date(date.getTime() + offsetDays * 86400000)).date;
}

function bangkokNowTime(date = new Date()) {
  const parts = bangkokParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function timeToMinutes(time) {
  const [hour, minute] = String(time).split(":").map(Number);
  return hour * 60 + minute;
}

function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

function serveStatic(res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR) || filePath.includes(`${path.sep}android${path.sep}`) || filePath.includes(`${path.sep}node_modules${path.sep}`)) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          sendJson(res, 404, { ok: false, error: "Not found" });
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallback);
      });
      return;
    }

    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

async function readSheetData() {
  const scriptData = await readSheetDataFromAppsScript().catch((error) => {
    console.warn(`Apps Script read failed: ${error.message}`);
    return null;
  });
  if (scriptData) return scriptData;

  const [holdingRows, priceRows] = await Promise.all([fetchSheetRows(requiredEnv("HOLDINGS_GID")), fetchSheetRows(requiredEnv("DAILY_PRICES_GID"))]);
  return normalizeSheetRows(holdingRows, priceRows);
}

async function readSheetDataFromAppsScript() {
  const result = await callAppsScript("readAll", {});
  if (!Array.isArray(result.holdings) || !Array.isArray(result.prices)) throw new Error("readAll result missing data");
  return normalizeSheetRows(result.holdings, result.prices);
}

async function fetchSheetRows(gid) {
  const sheetId = requiredEnv("GOOGLE_SHEET_ID");
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}&cachebust=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheet CSV returned ${response.status}`);
  return csvToObjects(await response.text());
}

function normalizeSheetRows(holdingRows, priceRows) {
  return {
    holdings: holdingRows
      .map((row, index) => {
        const name = cell(row, "รายการ");
        const weightBaht = parseNumber(cell(row, "จำนวนบาท"));
        const buyPrice = parseNumber(cell(row, "ราคาซื้อรวม"));
        if (!name || !weightBaht || !buyPrice) return null;
        return {
          id: `sheet-holding-${cell(row, "ลำดับ") || index + 1}`,
          sequence: cell(row, "ลำดับ") || String(index + 1),
          name,
          weightBaht,
          buyPrice,
          sellPrice: parseOptionalNumber(cell(row, "ราคาขายรวม")),
          purchaseDate: parseDateValue(cell(row, "วันที่ซื้อ")) || todayKey(),
          notifySell: parseBoolean(cell(row, "แจ้งเตือนขาย")),
          notifyDate: parseDateValue(cell(row, "วันที่แจ้งเตือน")) || "",
          createdAt: new Date().toISOString(),
          source: "Google Sheet",
        };
      })
      .filter(Boolean),
    prices: priceRows
      .map((row, index) => {
        const date = parseDateValue(cell(row, "วันที่"));
        const buy = parseNumber(cell(row, "รับซื้อ"));
        const sell = parseNumber(cell(row, "ขาย"));
        if (!date || !buy || !sell) return null;
        return {
          id: `sheet-price-${index + 1}`,
          date,
          time: normalizeTime(cell(row, "เวลา")) || nowTime(),
          buy,
          sell,
          source: cell(row, "แหล่งข้อมูล") || "Google Sheet",
          createdAt: new Date().toISOString(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
  };
}

async function callAppsScript(action, record) {
  const url = requiredEnv("APPS_SCRIPT_URL");
  const separator = url.includes("?") ? "&" : "?";
  const payload = { action, record };
  const requestUrl = `${url}${separator}payload=${encodeURIComponent(JSON.stringify(payload))}&cachebust=${Date.now()}`;
  const response = await fetch(requestUrl, { cache: "no-store" });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Apps Script did not return JSON");
  }
  if (!response.ok || result.ok === false) throw new Error(result.error || `Apps Script returned ${response.status}`);
  if (action !== "readAll" && !isExpectedAppsScriptResult(action, result)) {
    throw new Error(`Apps Script did not handle ${action}`);
  }
  return result;
}

function isExpectedAppsScriptResult(action, result) {
  if (action === "upsertDailyPrice") return Object.prototype.hasOwnProperty.call(result, "row");
  if (action === "upsertHolding") return Object.prototype.hasOwnProperty.call(result, "sequence");
  if (action === "deleteHolding") return Object.prototype.hasOwnProperty.call(result, "deleted");
  return false;
}

function requireAuth(req, res) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = verifyToken(token);
  if (!session) {
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return null;
  }
  return session;
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", requiredEnv("AUTH_SECRET")).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", requiredEnv("AUTH_SECRET")).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.username || Date.now() - Number(payload.iat || 0) > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sendCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(res, status, payload) {
  sendCors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function env(key) {
  return process.env[key] || "";
}

function requiredEnv(key) {
  const value = env(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function csvToObjects(csv) {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) =>
    headers.reduce((object, header, index) => {
      object[header] = row[index]?.trim() || "";
      return object;
    }, {}),
  );
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cellValue) => cellValue.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cellValue) => cellValue.trim() !== "")) rows.push(row);
  return rows;
}

function cell(row, key) {
  return row[key]?.trim() || "";
}

function parseOptionalNumber(value) {
  if (!value || value.trim() === "-") return null;
  const number = parseNumber(value);
  return number || null;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value || "")
    .replace(/[฿,\s]/g, "")
    .replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "y", "ใช่", "จริง", "แจ้ง", "checked"].includes(String(value || "").trim().toLowerCase());
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})[:.](\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return text;
}

function parseDateValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return normalizeDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) return normalizeDateParts(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : todayKey(parsed);
}

function normalizeDateParts(year, month, day) {
  const normalizedYear = year > 2400 ? year - 543 : year < 100 ? year + 2000 : year;
  if (!normalizedYear || !month || !day) return "";
  return `${normalizedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nowTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
