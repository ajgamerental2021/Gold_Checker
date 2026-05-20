const STORAGE_KEY = "aza-gold-state-v1";
const NOTIFICATION_LOG_KEY = "aza-gold-notification-log-v1";
const GOOGLE_SHEET_ID = "1i-619OKgmIHnBWapurp-_VfAx0dqh_cgcJBo-FHdeXw";
const HOLDINGS_GID = "1394429920";
const DAILY_PRICES_GID = "484644725";
const SHEET_WRITE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz62Dw-RJkEBuQ_7lzJEdqJQBGulf1Ro7iQ6WlLmwh0gB3fM9bXl5OCdI2qIVLhkqtm/exec";
const SHEET_WRITE_WEB_APP_URL_KEY = "aza-gold-sheet-write-web-app-url";
const THAI_GOLD_BAHT_GRAMS = 15.244;
const TROY_OUNCE_GRAMS = 31.1034768;
const GOLD_PURITY = 0.965;
const FORECAST_HORIZONS = [
  { label: "15 วัน", days: 15 },
  { label: "1 เดือน", days: 30 },
  { label: "3 เดือน", days: 90 },
  { label: "6 เดือน", days: 180 },
  { label: "1 ปี", days: 365 },
  { label: "3 ปี", days: 1095 },
  { label: "5 ปี", days: 1825 },
  { label: "10 ปี", days: 3650 },
];

let state = loadState();
let activeTab = "dashboard";
let toastTimer;

const el = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  pageTitle: document.querySelector("#pageTitle"),
  todayLabel: document.querySelector("#todayLabel"),
  refreshPrice: document.querySelector("#refreshPrice"),
  exportData: document.querySelector("#exportData"),
  importData: document.querySelector("#importData"),
  enableNotifications: document.querySelector("#enableNotifications"),
  notificationStatus: document.querySelector("#notificationStatus"),
  dashSellPrice: document.querySelector("#dashSellPrice"),
  dashBuyPrice: document.querySelector("#dashBuyPrice"),
  dashPriceTime: document.querySelector("#dashPriceTime"),
  dashWeight: document.querySelector("#dashWeight"),
  dashItemCount: document.querySelector("#dashItemCount"),
  dashUnrealized: document.querySelector("#dashUnrealized"),
  dashUnrealizedCaption: document.querySelector("#dashUnrealizedCaption"),
  sourceBadge: document.querySelector("#sourceBadge"),
  dueList: document.querySelector("#dueList"),
  priceChart: document.querySelector("#priceChart"),
  forecastChart: document.querySelector("#forecastChart"),
  priceRows: document.querySelector("#priceRows"),
  newHolding: document.querySelector("#newHolding"),
  holdingForm: document.querySelector("#holdingForm"),
  holdingId: document.querySelector("#holdingId"),
  holdingName: document.querySelector("#holdingName"),
  holdingWeight: document.querySelector("#holdingWeight"),
  holdingBuyPrice: document.querySelector("#holdingBuyPrice"),
  holdingSellPrice: document.querySelector("#holdingSellPrice"),
  holdingPurchaseDate: document.querySelector("#holdingPurchaseDate"),
  holdingNotify: document.querySelector("#holdingNotify"),
  holdingNotifyDate: document.querySelector("#holdingNotifyDate"),
  notifyDateWrap: document.querySelector("#notifyDateWrap"),
  cancelHolding: document.querySelector("#cancelHolding"),
  holdingCards: document.querySelector("#holdingCards"),
  forecastSummary: document.querySelector("#forecastSummary"),
  adviceBox: document.querySelector("#adviceBox"),
  forecastRows: document.querySelector("#forecastRows"),
  toast: document.querySelector("#toast"),
};

init();

function init() {
  captureSheetWriteUrl();
  el.todayLabel.textContent = formatFullDate(new Date());
  setupEvents();
  updateNotificationStatus();
  render();
  syncDataFromSheets(false);
  registerServiceWorker();
  scheduleNotificationChecks();
}

function setupEvents() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  el.refreshPrice.addEventListener("click", () => syncDataFromSheets(true));

  el.newHolding.addEventListener("click", () => openHoldingForm());
  el.cancelHolding.addEventListener("click", () => closeHoldingForm());
  el.holdingNotify.addEventListener("change", () => {
    el.notifyDateWrap.classList.toggle("hidden", !el.holdingNotify.checked);
    el.holdingNotifyDate.required = el.holdingNotify.checked;
  });

  el.holdingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveHoldingFromForm();
  });

  el.enableNotifications.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showToast("เบราว์เซอร์นี้ยังไม่รองรับ Notification");
      return;
    }
    const result = await Notification.requestPermission();
    updateNotificationStatus();
    showToast(result === "granted" ? "เปิดแจ้งเตือนแล้ว" : "ยังไม่ได้อนุญาต Notification");
  });

  el.exportData.addEventListener("click", exportBackup);
  el.importData.addEventListener("change", importBackup);
  window.addEventListener("resize", renderCharts);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDueNotifications();
  });
}

async function refreshLivePrice(showResult, writeToSheet = false) {
  try {
    setLoadingPrice(true);
    const live = await fetchLiveThaiGoldPrice();
    upsertDailyPrice(live);
    const writeResult = writeToSheet ? await writeDailyPriceToSheet(live) : { configured: false };
    persist();
    render();
    if (showResult) showToast(writeResult.configured ? "อัพเดทราคาทองวันนี้และส่งเข้า Sheet แล้ว" : "อัพเดทราคาทองวันนี้แล้ว");
  } catch (error) {
    console.error(error);
    if (showResult) showToast("ดึงราคาไม่ได้ กรุณาตรวจ Google Sheet หรืออินเทอร์เน็ต");
  } finally {
    setLoadingPrice(false);
  }
}

async function syncDataFromSheets(showResult) {
  try {
    setLoadingPrice(true);
    const [holdingResult, priceResult] = await Promise.allSettled([fetchSheetHoldings(), fetchSheetPrices()]);
    let synced = false;
    let fallbackWriteResult = null;

    if (holdingResult.status === "fulfilled" && holdingResult.value.length) {
      state.holdings = holdingResult.value;
      synced = true;
    }

    if (priceResult.status === "fulfilled" && priceResult.value.length) {
      state.prices = priceResult.value;
      synced = true;
    }

    if (!latestPriceForDate(todayKey())) {
      const live = await fetchLiveThaiGoldPrice();
      upsertDailyPrice(live);
      fallbackWriteResult = await writeDailyPriceToSheet(live);
    }

    persist();
    render();

    if (showResult) {
      if (fallbackWriteResult?.configured) {
        showToast("ไม่มีราคาวันนี้ใน Sheet เลยส่งราคาสดเข้า Sheet แล้ว");
      } else if (fallbackWriteResult && !fallbackWriteResult.configured) {
        showToast("ไม่มีราคาวันนี้ใน Sheet ใช้ราคาสดในเครื่องก่อน");
      } else {
        showToast(synced ? "ซิงค์ข้อมูลจาก Google Sheet แล้ว" : "Google Sheet ยังไม่มีแถวข้อมูล ใช้ราคาสดวันนี้แทน");
      }
    }
  } catch (error) {
    console.error(error);
    if (!latestPriceForDate(todayKey())) await refreshLivePrice(false, true);
    if (showResult) showToast("ซิงค์ Google Sheet ไม่สำเร็จ ใช้ข้อมูลล่าสุดในเครื่องแทน");
  } finally {
    setLoadingPrice(false);
  }
}

async function fetchSheetHoldings() {
  const rows = await fetchSheetRows(HOLDINGS_GID);
  return rows
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
    .filter(Boolean);
}

async function fetchSheetPrices() {
  const rows = await fetchSheetRows(DAILY_PRICES_GID);
  return rows
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
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

async function fetchSheetRows(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${gid}&cachebust=${Date.now()}`;
  const csv = await fetchText(url);
  return csvToObjects(csv);
}

async function writeDailyPriceToSheet(price) {
  const url = getSheetWriteUrl();
  if (!url) return { configured: false, sent: false };

  const payload = {
    action: "upsertDailyPrice",
    sheetId: GOOGLE_SHEET_ID,
    gid: DAILY_PRICES_GID,
    record: {
      date: price.date,
      time: price.time,
      buy: price.buy,
      sell: price.sell,
      source: price.source,
    },
  };

  await sendSheetWritePayload(payload);

  return { configured: true, sent: true };
}

async function writeHoldingToSheet(item) {
  const url = getSheetWriteUrl();
  if (!url) return { configured: false, sent: false };

  const payload = {
    action: "upsertHolding",
    sheetId: GOOGLE_SHEET_ID,
    gid: HOLDINGS_GID,
    record: {
      sequence: item.sequence,
      name: item.name,
      weightBaht: item.weightBaht,
      buyPrice: item.buyPrice,
      sellPrice: item.sellPrice,
      purchaseDate: item.purchaseDate,
      notifySell: item.notifySell,
      notifyDate: item.notifyDate,
    },
  };

  await sendSheetWritePayload(payload);

  return { configured: true, sent: true };
}

async function sendSheetWritePayload(payload) {
  const url = getSheetWriteUrl();
  const separator = url.includes("?") ? "&" : "?";
  const requestUrl = `${url}${separator}payload=${encodeURIComponent(JSON.stringify(payload))}&cachebust=${Date.now()}`;
  await fetch(requestUrl, { method: "GET", mode: "no-cors", cache: "no-store" });
}

async function fetchLiveThaiGoldPrice() {
  const gold = await fetchGoldSpotUsd();
  const fx = await fetchUsdThbRate();
  const spotUsd = Number(gold.price);
  const thbRate = Number(fx.rate);
  if (!spotUsd || !thbRate) throw new Error("Live price payload missing");

  const estimatedThaiBaht = spotUsd * thbRate * (THAI_GOLD_BAHT_GRAMS / TROY_OUNCE_GRAMS) * GOLD_PURITY;
  const sell = roundToNearest(estimatedThaiBaht, 50);
  const buy = Math.max(0, sell - 100);

  return {
    id: crypto.randomUUID(),
    date: todayKey(),
    time: nowTime(),
    buy,
    sell,
    spotUsd,
    thbRate,
    source: gold.source,
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

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function upsertDailyPrice(record) {
  const existingIndex = state.prices.findIndex((item) => item.date === record.date);
  if (existingIndex >= 0) {
    state.prices[existingIndex] = { ...state.prices[existingIndex], ...record, id: state.prices[existingIndex].id };
  } else {
    state.prices.push(record);
  }
  state.prices.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

function setTab(tabName) {
  activeTab = tabName;
  el.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  el.panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === tabName));
  el.pageTitle.textContent = {
    dashboard: "Dashboard",
    prices: "ราคาทอง",
    holdings: "ทองสะสม",
    forecast: "คาดการณ์",
  }[tabName];
  renderCharts();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function openHoldingForm(holding) {
  el.holdingForm.classList.remove("hidden");
  el.holdingId.value = holding?.id || "";
  el.holdingName.value = holding?.name || "";
  el.holdingWeight.value = holding?.weightBaht || "";
  el.holdingBuyPrice.value = holding?.buyPrice || "";
  el.holdingSellPrice.value = holding?.sellPrice || "";
  el.holdingPurchaseDate.value = holding?.purchaseDate || todayKey();
  el.holdingNotify.checked = Boolean(holding?.notifySell);
  el.holdingNotifyDate.value = holding?.notifyDate || "";
  el.notifyDateWrap.classList.toggle("hidden", !el.holdingNotify.checked);
  el.holdingNotifyDate.required = el.holdingNotify.checked;
  el.holdingName.focus();
}

function closeHoldingForm() {
  el.holdingForm.reset();
  el.holdingId.value = "";
  el.notifyDateWrap.classList.add("hidden");
  el.holdingNotifyDate.required = false;
  el.holdingForm.classList.add("hidden");
}

async function saveHoldingFromForm() {
  const id = el.holdingId.value || crypto.randomUUID();
  const existing = state.holdings.find((holding) => holding.id === id);
  const item = {
    id,
    sequence: existing?.sequence || nextHoldingSequence(),
    name: el.holdingName.value.trim(),
    weightBaht: Number(el.holdingWeight.value),
    buyPrice: Number(el.holdingBuyPrice.value),
    sellPrice: el.holdingSellPrice.value ? Number(el.holdingSellPrice.value) : null,
    purchaseDate: el.holdingPurchaseDate.value,
    notifySell: el.holdingNotify.checked,
    notifyDate: el.holdingNotify.checked ? el.holdingNotifyDate.value : "",
    createdAt: new Date().toISOString(),
  };

  const index = state.holdings.findIndex((holding) => holding.id === id);
  if (index >= 0) {
    state.holdings[index] = { ...state.holdings[index], ...item };
  } else {
    state.holdings.push(item);
  }

  persist();
  closeHoldingForm();
  render();

  try {
    const writeResult = await writeHoldingToSheet(item);
    showToast(writeResult.configured ? "บันทึกรายการทองและส่งเข้า Sheet แล้ว" : "บันทึกรายการทองในเครื่องแล้ว");
  } catch (error) {
    console.error(error);
    showToast("บันทึกในเครื่องแล้ว แต่ส่งเข้า Sheet ไม่สำเร็จ");
  }
}

function render() {
  renderDashboard();
  renderPrices();
  renderHoldings();
  renderForecast();
  renderCharts();
}

function renderDashboard() {
  const price = latestPrice();
  const totals = calculatePortfolio();
  el.dashSellPrice.textContent = price ? money(price.sell) : "-";
  el.dashBuyPrice.textContent = price ? money(price.buy) : "-";
  el.dashPriceTime.textContent = price ? `${formatShortDate(price.date)} ${price.time}` : "ยังไม่มีข้อมูล";
  el.dashWeight.textContent = `${formatNumber(totals.weight)} บาท`;
  el.dashItemCount.textContent = `${state.holdings.length} รายการ`;
  el.dashUnrealized.textContent = signedMoney(totals.unrealized);
  el.dashUnrealized.classList.toggle("profit", totals.unrealized > 0);
  el.dashUnrealized.classList.toggle("loss", totals.unrealized < 0);
  el.dashUnrealizedCaption.textContent = totals.cost ? `ทุนรวม ${money(totals.cost)}` : "ยังไม่มีรายการทองสะสม";
  el.sourceBadge.textContent = price ? price.source : "-";

  const dueItems = state.holdings.filter((holding) => holding.notifySell && holding.notifyDate && holding.notifyDate <= todayKey());
  if (!dueItems.length) {
    el.dueList.className = "due-list empty-state";
    el.dueList.textContent = "ยังไม่มีรายการที่ถึงวันแจ้งเตือนขาย";
    return;
  }

  el.dueList.className = "due-list";
  el.dueList.innerHTML = dueItems
    .map(
      (item, index) => `
        <div class="due-item">
          <strong>รายการที่ ${index + 1}: ${escapeHtml(item.name)}</strong>
          <p>${formatShortDate(item.notifyDate)} · ${formatNumber(item.weightBaht)} บาท</p>
        </div>
      `,
    )
    .join("");
}

function renderPrices() {
  if (!state.prices.length) {
    el.priceRows.innerHTML = `<tr><td colspan="5">ยังไม่มีประวัติราคา</td></tr>`;
    return;
  }

  el.priceRows.innerHTML = state.prices
    .map(
      (price) => `
        <tr>
          <td data-label="วันที่">${formatShortDate(price.date)}</td>
          <td data-label="เวลา">${price.time || "-"}</td>
          <td data-label="รับซื้อ">${money(price.buy)}</td>
          <td data-label="ขาย">${money(price.sell)}</td>
          <td data-label="แหล่งข้อมูล">${price.source || "-"}</td>
        </tr>
      `,
    )
    .join("");
}

function renderHoldings() {
  if (!state.holdings.length) {
    el.holdingCards.innerHTML = `<div class="empty-state">ยังไม่มีรายการทองสะสม</div>`;
    return;
  }

  const current = latestPrice();
  const currentSell = current?.sell || 0;

  el.holdingCards.innerHTML = state.holdings
    .map((item) => {
      const salePrice = item.sellPrice || null;
      const currentValue = currentSell * item.weightBaht;
      const realized = salePrice ? salePrice - item.buyPrice : null;
      const unrealized = currentSell ? currentValue - item.buyPrice : 0;
      const diff = realized ?? unrealized;
      const diffLabel = salePrice ? "ส่วนต่างขายแล้ว" : "ส่วนต่างปัจจุบัน";
      const diffClass = diff > 0 ? "profit" : diff < 0 ? "loss" : "";
      return `
        <article class="holding-card">
          <header>
            <div>
              <h4>${escapeHtml(item.name)}</h4>
              <p>ซื้อวันที่ ${formatShortDate(item.purchaseDate)}</p>
            </div>
            <div class="card-actions">
              <button class="mini-button" type="button" data-edit-holding="${item.id}" title="แก้ไข">✎</button>
            </div>
          </header>
          <div class="holding-stats">
            <div class="stat"><span>จำนวน</span><strong>${formatNumber(item.weightBaht)} บาท</strong></div>
            <div class="stat"><span>ราคาซื้อรวม</span><strong>${money(item.buyPrice)}</strong></div>
            <div class="stat"><span>ราคาขายรวม</span><strong>${salePrice ? money(salePrice) : "-"}</strong></div>
            <div class="stat"><span>${diffLabel}</span><strong class="${diffClass}">${signedMoney(diff)}</strong></div>
          </div>
          <p>${item.notifySell && item.notifyDate ? `แจ้งเตือนขาย ${formatShortDate(item.notifyDate)} เวลา 09.05 และ 12.00 น.` : "ไม่ได้ตั้งแจ้งเตือนขาย"}</p>
        </article>
      `;
    })
    .join("");

  el.holdingCards.querySelectorAll("[data-edit-holding]").forEach((button) => {
    button.addEventListener("click", () => openHoldingForm(state.holdings.find((holding) => holding.id === button.dataset.editHolding)));
  });
}

function renderForecast() {
  const price = latestPrice();
  const portfolio = calculatePortfolio();

  if (!price) {
    el.forecastRows.innerHTML = `<tr><td colspan="4">ยังไม่มีราคาทองสำหรับคาดการณ์</td></tr>`;
    el.adviceBox.innerHTML = "เพิ่มราคาทองวันนี้ก่อน";
    return;
  }

  const trend = calculateTrend();
  const rows = FORECAST_HORIZONS.map((horizon) => {
    const projected = projectPrice(price.sell, horizon.days, trend.annualRate);
    const saleValue = projected * portfolio.weight;
    const diff = saleValue - portfolio.cost;
    return { ...horizon, projected, saleValue, diff };
  });

  const short = rows.find((row) => row.days === 30);
  const long = rows.find((row) => row.days === 365);
  const shortAdvice = short.diff >= 0 ? "ระยะสั้นยังถือได้ถ้ารับความผันผวนได้" : "ระยะสั้นควรตั้งเป้าราคาขายให้ชัด";
  const longAdvice = long.diff >= short.diff ? "ระยะยาวมีโอกาสชดเชยความผันผวนได้ดีกว่า" : "ระยะยาวยังควรติดตามแนวโน้มใกล้ชิด";

  el.forecastSummary.textContent = `อิงแนวโน้ม ${formatPercent(trend.annualRate)} ต่อปี จากข้อมูล ${state.prices.length} วัน`;
  el.adviceBox.innerHTML = `
    <div><strong>${shortAdvice}</strong>15-30 วัน: ${money(short.projected)} ต่อบาททอง</div>
    <div><strong>${longAdvice}</strong>1 ปี: ${money(long.projected)} ต่อบาททอง</div>
    <div>หมายเหตุ: เป็นการคำนวณเชิงสถิติจากข้อมูลในแอพ ไม่ใช่คำแนะนำทางการเงิน</div>
  `;

  el.forecastRows.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td data-label="ระยะเวลา">${row.label}</td>
          <td data-label="ราคาคาดการณ์">${money(row.projected)}</td>
          <td data-label="มูลค่าขายโดยประมาณ">${money(row.saleValue)}</td>
          <td data-label="ส่วนต่างจากทุน" class="${row.diff > 0 ? "profit" : row.diff < 0 ? "loss" : ""}">${signedMoney(row.diff)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderCharts() {
  drawPriceChart();
  drawForecastChart();
}

function drawPriceChart() {
  const canvas = el.priceChart;
  const prices = [...state.prices].sort((a, b) => a.date.localeCompare(b.date));
  drawLineChart(canvas, prices.map((item) => ({ label: formatShortDate(item.date), value: item.sell })), {
    color: "#c28a11",
    fill: "rgba(194, 138, 17, 0.12)",
    emptyText: "ยังไม่มีข้อมูลราคา",
  });
}

function drawForecastChart() {
  const price = latestPrice();
  if (!price) {
    drawLineChart(el.forecastChart, [], { emptyText: "ยังไม่มีข้อมูลคาดการณ์" });
    return;
  }
  const trend = calculateTrend();
  const points = [{ label: "วันนี้", value: price.sell }].concat(
    FORECAST_HORIZONS.map((horizon) => ({
      label: horizon.label,
      value: projectPrice(price.sell, horizon.days, trend.annualRate),
    })),
  );
  drawLineChart(el.forecastChart, points, {
    color: "#2563eb",
    fill: "rgba(37, 99, 235, 0.1)",
    emptyText: "ยังไม่มีข้อมูลคาดการณ์",
  });
}

function drawLineChart(canvas, points, options = {}) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  const height = Number(canvas.getAttribute("height")) || 260;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = 24 + i * ((height - 58) / 3);
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = "#667085";
    ctx.font = "14px system-ui";
    ctx.fillText(options.emptyText || "ไม่มีข้อมูล", 48, height / 2);
    return;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values) * 0.995;
  const max = Math.max(...values) * 1.005;
  const range = max - min || 1;
  const chartWidth = width - 76;
  const chartHeight = height - 62;
  const xFor = (index) => 48 + (points.length === 1 ? 0 : index * (chartWidth / (points.length - 1)));
  const yFor = (value) => 22 + chartHeight - ((value - min) / range) * chartHeight;

  ctx.fillStyle = "#667085";
  ctx.font = "12px system-ui";
  ctx.fillText(money(max), 6, 28);
  ctx.fillText(money(min), 6, height - 36);

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(points.length - 1), height - 38);
  ctx.lineTo(48, height - 38);
  ctx.closePath();
  ctx.fillStyle = options.fill || "rgba(194, 138, 17, 0.12)";
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = options.color || "#c28a11";
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = options.color || "#c28a11";
    ctx.fill();
    if (index === 0 || index === points.length - 1 || points.length <= 8) {
      ctx.fillStyle = "#475467";
      ctx.font = "12px system-ui";
      ctx.fillText(point.label, Math.min(x, width - 82), height - 12);
    }
  });
}

function calculatePortfolio() {
  const currentSell = latestPrice()?.sell || 0;
  return state.holdings.reduce(
    (totals, item) => {
      const cost = item.buyPrice;
      const marketValue = currentSell * item.weightBaht;
      totals.weight += item.weightBaht;
      totals.cost += cost;
      totals.marketValue += marketValue;
      totals.unrealized += marketValue - cost;
      return totals;
    },
    { weight: 0, cost: 0, marketValue: 0, unrealized: 0 },
  );
}

function calculateTrend() {
  const prices = [...state.prices].sort((a, b) => a.date.localeCompare(b.date));
  if (prices.length < 2) return { annualRate: 0.045 };

  const first = prices[0];
  const last = prices[prices.length - 1];
  const days = Math.max(1, daysBetween(first.date, last.date));
  const rawRate = Math.pow(last.sell / first.sell, 365 / days) - 1;
  const clamped = Math.min(0.22, Math.max(-0.18, rawRate));
  return { annualRate: Number.isFinite(clamped) ? clamped : 0.045 };
}

function projectPrice(currentPrice, days, annualRate) {
  const projected = currentPrice * Math.pow(1 + annualRate, days / 365);
  return roundToNearest(projected, 50);
}

function latestPrice() {
  return [...state.prices].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0] || null;
}

function latestPriceForDate(date) {
  return state.prices.find((price) => price.date === date) || null;
}

function scheduleNotificationChecks() {
  checkDueNotifications();
  setInterval(checkDueNotifications, 60 * 1000);
  setInterval(() => syncDataFromSheets(false), 30 * 60 * 1000);
}

function checkDueNotifications() {
  const now = new Date();
  const date = todayKey(now);
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const log = loadNotificationLog();

  if (hhmm >= "09:00" && !log[`daily-${date}`]) {
    const totals = calculatePortfolio();
    notify("AzA Gold", `ราคาทองวันนี้ ${latestPrice() ? money(latestPrice().sell) : "-"} · ส่วนต่าง ${signedMoney(totals.unrealized)}`);
    log[`daily-${date}`] = true;
  }

  state.holdings
    .filter((holding) => holding.notifySell && holding.notifyDate === date)
    .forEach((holding, index) => {
      ["09:05", "12:00"].forEach((slot) => {
        const key = `sell-${holding.id}-${date}-${slot}`;
        if (hhmm >= slot && !log[key]) {
          notify("AzA Gold", `ขายทองรายการที่ ${index + 1}: ${holding.name}`);
          log[key] = true;
        }
      });
    });

  localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(log));
}

function notify(title, body) {
  showToast(body);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, tag: `${title}-${body}` });
  }
}

function updateNotificationStatus() {
  if (!("Notification" in window)) {
    el.notificationStatus.textContent = "เบราว์เซอร์นี้ไม่รองรับ Notification";
  } else if (Notification.permission === "granted") {
    el.notificationStatus.textContent = "Notification เปิดอยู่";
  } else if (Notification.permission === "denied") {
    el.notificationStatus.textContent = "Notification ถูกปิดในเบราว์เซอร์";
  } else {
    el.notificationStatus.textContent = "Notification ยังไม่ได้เปิด";
  }
}

function exportBackup() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `aza-gold-backup-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      state = {
        prices: Array.isArray(imported.prices) ? imported.prices : [],
        holdings: Array.isArray(imported.holdings) ? imported.holdings : [],
      };
      persist();
      render();
      showToast("นำเข้าข้อมูลแล้ว");
    } catch (error) {
      console.error(error);
      showToast("ไฟล์ backup ไม่ถูกต้อง");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function captureSheetWriteUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("sheetWriteUrl");
  if (url) {
    localStorage.setItem(SHEET_WRITE_WEB_APP_URL_KEY, url.trim());
    history.replaceState({}, "", window.location.pathname);
  }
}

function getSheetWriteUrl() {
  return (localStorage.getItem(SHEET_WRITE_WEB_APP_URL_KEY) || SHEET_WRITE_WEB_APP_URL).trim();
}

function nextHoldingSequence() {
  const maxSequence = state.holdings.reduce((max, holding, index) => {
    const numeric = Number(holding.sequence);
    return Math.max(max, Number.isFinite(numeric) ? numeric : index + 1);
  }, 0);
  return String(maxSequence + 1);
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

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000) {
      return todayKey(new Date(Math.round((serial - 25569) * 86400000)));
    }
  }

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return normalizeDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) return normalizeDateParts(Number(slash[3]), Number(slash[2]), Number(slash[1]));

  const thai = text.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})$/);
  if (thai) {
    const month = thaiMonthNumber(thai[2]);
    if (month) return normalizeDateParts(Number(thai[3]), month, Number(thai[1]));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : todayKey(parsed);
}

function normalizeDateParts(year, month, day) {
  const normalizedYear = year > 2400 ? year - 543 : year < 100 ? year + 2000 : year;
  if (!normalizedYear || !month || !day) return "";
  return `${normalizedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function thaiMonthNumber(value) {
  const key = value.replaceAll(".", "").trim();
  const months = {
    มค: 1,
    มกราคม: 1,
    กพ: 2,
    กุมภาพันธ์: 2,
    มีค: 3,
    มีนาคม: 3,
    เมย: 4,
    เมษายน: 4,
    พค: 5,
    พฤษภาคม: 5,
    มิย: 6,
    มิถุนายน: 6,
    กค: 7,
    กรกฎาคม: 7,
    สค: 8,
    สิงหาคม: 8,
    กย: 9,
    กันยายน: 9,
    ตค: 10,
    ตุลาคม: 10,
    พย: 11,
    พฤศจิกายน: 11,
    ธค: 12,
    ธันวาคม: 12,
  };
  return months[key] || 0;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      prices: Array.isArray(saved?.prices) ? saved.prices : [],
      holdings: Array.isArray(saved?.holdings) ? saved.holdings : [],
    };
  } catch {
    return { prices: [], holdings: [] };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadNotificationLog() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATION_LOG_KEY)) || {};
  } catch {
    return {};
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
    return;
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function setLoadingPrice(isLoading) {
  el.refreshPrice.disabled = isLoading;
  el.refreshPrice.textContent = isLoading ? "…" : "↻";
}

function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 2800);
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(date);
}

function formatShortDate(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${dateString}T00:00:00`));
}

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function signedMoney(value) {
  const number = Number(value) || 0;
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${money(Math.abs(number))}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("th-TH", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

function daysBetween(start, end) {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  return Math.round((endMs - startMs) / 86400000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
