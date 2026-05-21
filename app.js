const STORAGE_KEY = "aza-gold-state-v1";
const NOTIFICATION_LOG_KEY = "aza-gold-notification-log-v1";
const NOTIFICATION_ENABLED_KEY = "aza-gold-notifications-enabled-v1";
const AUTH_TOKEN_KEY = "aza-gold-auth-token-v1";
const REMEMBER_LOGIN_KEY = "aza-gold-remember-login-v1";
const API_BASE_URL_KEY = "aza-gold-api-base-url-v1";
const DEFAULT_REMOTE_API_BASE_URL = "https://aza-gold-checker.onrender.com";
const NATIVE_NOTIFICATION_CHANNEL_ID = "aza-gold-alerts";
const NATIVE_NOTIFICATION_ID_MIN = 860000;
const NATIVE_NOTIFICATION_ID_MAX = 999999;
const DAILY_NOTIFICATION_ID = 860001;
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
let externalTrend = { points: [], status: "idle", thbRate: null, source: "CoinGecko PAX Gold", updatedAt: "" };
let selectedPriceMonth = new Date().getMonth() + 1;
let selectedPriceYear = new Date().getFullYear();
let isAuthenticated = Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
let sheetDataPromise = null;
let notificationTimersStarted = false;
let soldSectionOpen = false;

markRuntimeShell();

const el = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  rememberLogin: document.querySelector("#rememberLogin"),
  logoutButton: document.querySelector("#logoutButton"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  pageTitle: document.querySelector("#pageTitle"),
  todayLabel: document.querySelector("#todayLabel"),
  refreshPrice: document.querySelector("#refreshPrice"),
  exportData: document.querySelector("#exportData"),
  importData: document.querySelector("#importData"),
  enableNotifications: document.querySelector("#enableNotifications"),
  notificationStatus: document.querySelector("#notificationStatus"),
  saleHistoryButton: document.querySelector("#saleHistoryButton"),
  saleHistoryModal: document.querySelector("#saleHistoryModal"),
  closeSaleHistory: document.querySelector("#closeSaleHistory"),
  saleHistoryContent: document.querySelector("#saleHistoryContent"),
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
  externalTrendChart: document.querySelector("#externalTrendChart"),
  externalTrendSummary: document.querySelector("#externalTrendSummary"),
  externalTrendSource: document.querySelector("#externalTrendSource"),
  priceMonth: document.querySelector("#priceMonth"),
  priceYear: document.querySelector("#priceYear"),
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
  soldSection: document.querySelector("#soldSection"),
  soldToggle: document.querySelector("#soldToggle"),
  soldToggleLabel: document.querySelector("#soldToggleLabel"),
  soldToggleIcon: document.querySelector("#soldToggleIcon"),
  soldCards: document.querySelector("#soldCards"),
  forecastSummary: document.querySelector("#forecastSummary"),
  adviceBox: document.querySelector("#adviceBox"),
  forecastRows: document.querySelector("#forecastRows"),
  toast: document.querySelector("#toast"),
};

init();

function markRuntimeShell() {
  const isNativeApp =
    location.protocol === "capacitor:" || (location.protocol === "https:" && location.hostname === "localhost");
  document.documentElement.classList.toggle("is-native-app", isNativeApp);
}

function init() {
  captureApiBaseUrl();
  el.todayLabel.textContent = formatFullDate(new Date());
  setupEvents();
  restoreRememberedLogin();
  if (isAuthenticated) {
    startAuthenticatedApp();
  } else {
    setAuthenticated(false);
  }
}

function setupEvents() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  el.refreshPrice.addEventListener("click", async () => {
    await syncDataFromSheets(true);
    await loadExternalGoldTrend(false);
  });

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

  el.enableNotifications.addEventListener("click", toggleNotificationAccess);
  el.logoutButton.addEventListener("click", logout);
  el.saleHistoryButton.addEventListener("click", openSaleHistory);
  el.closeSaleHistory.addEventListener("click", closeSaleHistory);
  el.saleHistoryModal.addEventListener("click", (event) => {
    if (event.target === el.saleHistoryModal) closeSaleHistory();
  });
  el.soldToggle.addEventListener("click", () => {
    soldSectionOpen = !soldSectionOpen;
    renderSoldHoldings();
  });
  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
  });

  el.exportData.addEventListener("click", exportBackup);
  el.importData.addEventListener("change", importBackup);
  el.priceMonth.addEventListener("change", () => {
    selectedPriceMonth = Number(el.priceMonth.value);
    renderPrices();
  });
  el.priceYear.addEventListener("change", () => {
    selectedPriceYear = Number(el.priceYear.value);
    renderPrices();
  });
  window.addEventListener("resize", renderCharts);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isAuthenticated) checkDueNotifications();
  });
}

async function login() {
  const username = el.loginUsername.value.trim();
  const password = el.loginPassword.value;
  const submitButton = el.loginForm.querySelector('button[type="submit"]');

  try {
    submitButton.disabled = true;
    const result = await apiFetch("/api/login", {
      method: "POST",
      skipAuth: true,
      body: { username, password },
    });

    localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    if (el.rememberLogin.checked) {
      localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ username, password }));
    } else {
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
    }

    isAuthenticated = true;
    startAuthenticatedApp();
  } catch (error) {
    console.error(error);
    showToast("ชื่อบัญชีหรือรหัสผ่านไม่ถูกต้อง");
  } finally {
    submitButton.disabled = false;
  }
}

function logout() {
  const confirmed = window.confirm("ยืนยัน Logout ออกจาก AzA Gold หรือไม่?");
  if (!confirmed) return;

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(NOTIFICATION_LOG_KEY);
  state = { prices: [], holdings: [] };
  sheetDataPromise = null;
  isAuthenticated = false;
  setAuthenticated(false);
  render();
}

function restoreRememberedLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_LOGIN_KEY));
    if (!saved) return;
    el.loginUsername.value = saved.username || "";
    el.loginPassword.value = saved.password || "";
    el.rememberLogin.checked = Boolean(saved.username || saved.password);
  } catch {
    localStorage.removeItem(REMEMBER_LOGIN_KEY);
  }
}

function startAuthenticatedApp() {
  setAuthenticated(true);
  updateNotificationStatus();
  render();
  syncDataFromSheets(false);
  loadExternalGoldTrend(false);
  registerServiceWorker();
  scheduleNotificationChecks();
}

function setAuthenticated(value) {
  isAuthenticated = value;
  el.loginScreen.classList.toggle("hidden", value);
  el.appShell.classList.toggle("hidden", !value);
  if (!value) {
    el.loginPassword.focus();
  }
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const request = {
    method: options.method || "GET",
    cache: "no-store",
    headers,
  };

  if (!options.skipAuth) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, request);
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("API did not return JSON");
  }

  if (response.status === 401 && !options.skipAuth) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    isAuthenticated = false;
    setAuthenticated(false);
    throw new Error("Session expired");
  }

  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `API returned ${response.status}`);
  }

  return result;
}

function captureApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("apiBaseUrl");
  if (!url) return;
  localStorage.setItem(API_BASE_URL_KEY, url.trim().replace(/\/$/, ""));
  history.replaceState({}, "", window.location.pathname);
}

function getApiBaseUrl() {
  const saved = (localStorage.getItem(API_BASE_URL_KEY) || "").trim().replace(/\/$/, "");
  if (saved) return saved;

  const isNativeApp =
    location.protocol === "capacitor:" || (location.protocol === "https:" && location.hostname === "localhost");
  const isGithubPages = location.hostname.endsWith("github.io");
  return isNativeApp || isGithubPages ? DEFAULT_REMOTE_API_BASE_URL : "";
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
    const sheetResult = await fetchSheetData();
    let synced = false;
    let fallbackWriteResult = null;

    if (Array.isArray(sheetResult.holdings)) {
      state.holdings = sheetResult.holdings;
      synced = true;
    }

    if (Array.isArray(sheetResult.prices)) {
      state.prices = sheetResult.prices;
      synced = true;
    }

    if (!latestPriceForDate(todayKey())) {
      const live = await fetchLiveThaiGoldPrice();
      upsertDailyPrice(live);
      fallbackWriteResult = await writeDailyPriceToSheet(live);
    }

    persist();
    render();
    syncNativeNotificationSchedule();

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

async function fetchSheetData() {
  if (!isAuthenticated) return { holdings: [], prices: [] };
  if (!sheetDataPromise) {
    sheetDataPromise = apiFetch("/api/data").finally(() => {
      sheetDataPromise = null;
    });
  }
  return sheetDataPromise;
}

async function loadExternalGoldTrend(showResult) {
  try {
    externalTrend = { ...externalTrend, status: "loading" };
    renderExternalTrendSummary();
    drawExternalTrendChart();

    const trend = await fetchCoinGeckoPaxGoldTrend();
    externalTrend = { ...trend, status: "ready" };
    renderExternalTrendSummary();
    drawExternalTrendChart();
    if (showResult) showToast("อัพเดทแนวโน้มราคาทองจาก CoinGecko แล้ว");
  } catch (error) {
    console.error(error);
    externalTrend = { ...externalTrend, status: "error" };
    renderExternalTrendSummary();
    drawExternalTrendChart();
    if (showResult) showToast("ดึงแนวโน้มภายนอกไม่สำเร็จ");
  }
}

async function fetchCoinGeckoPaxGoldTrend() {
  const [data, fx] = await Promise.all([
    fetchJson("https://api.coingecko.com/api/v3/coins/pax-gold/market_chart?vs_currency=usd&days=90&interval=daily"),
    fetchUsdThbRate(),
  ]);
  const thbRate = Number(fx.rate);
  const prices = Array.isArray(data.prices) ? data.prices : [];
  const points = prices
    .map(([timestamp, usd]) => {
      const date = new Date(timestamp);
      return {
        date: todayKey(date),
        label: formatShortDate(todayKey(date)),
        value: convertTroyOunceUsdToThaiGoldBaht(Number(usd), thbRate),
        usd: Number(usd),
      };
    })
    .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0);

  if (!points.length) throw new Error("CoinGecko trend payload missing");

  return {
    points,
    thbRate,
    source: "CoinGecko PAX Gold",
    updatedAt: new Date().toISOString(),
  };
}

function convertTroyOunceUsdToThaiGoldBaht(usdPerTroyOunce, thbRate) {
  const estimated = usdPerTroyOunce * thbRate * (THAI_GOLD_BAHT_GRAMS / TROY_OUNCE_GRAMS) * GOLD_PURITY;
  return roundToNearest(estimated, 50);
}

async function writeDailyPriceToSheet(price) {
  const result = await apiFetch("/api/prices", {
    method: "POST",
    body: {
      date: price.date,
      time: price.time,
      buy: price.buy,
      sell: price.sell,
      source: price.source,
    },
  });
  return { configured: true, sent: true, verified: true, result: result.result || result };
}

async function writeHoldingToSheet(item) {
  const result = await apiFetch("/api/holdings", {
    method: "POST",
    body: {
      sequence: item.sequence,
      name: item.name,
      weightBaht: item.weightBaht,
      buyPrice: item.buyPrice,
      sellPrice: item.sellPrice,
      purchaseDate: item.purchaseDate,
      notifySell: item.notifySell,
      notifyDate: item.notifyDate,
    },
  });
  return { configured: true, sent: true, verified: true, result: result.result || result };
}

async function deleteHoldingFromSheet(item) {
  const result = await apiFetch(`/api/holdings/${encodeURIComponent(item.sequence)}`, { method: "DELETE" });
  return { configured: true, sent: true, verified: true, result: result.result || result };
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
  syncNativeNotificationSchedule();

  try {
    const writeResult = await writeHoldingToSheet(item);
    showToast(writeResult.configured ? "บันทึกรายการทองและซิงค์เข้า Sheet แล้ว" : "บันทึกรายการทองในเครื่องแล้ว");
  } catch (error) {
    console.error(error);
    showToast(sheetWriteErrorMessage(error, "บันทึกในเครื่องแล้ว"));
  }
}

async function deleteHolding(id) {
  const item = state.holdings.find((holding) => holding.id === id);
  if (!item) return;

  const confirmed = window.confirm(`ยืนยันลบรายการ "${item.name}" หรือไม่?\nรายการนี้จะถูกลบทั้งในแอพและ Google Sheet`);
  if (!confirmed) return;

  try {
    const writeResult = await deleteHoldingFromSheet(item);
    state.holdings = state.holdings.filter((holding) => holding.id !== id);
    persist();
    render();
    syncNativeNotificationSchedule();
    showToast(
      writeResult.configured && writeResult.result?.deleted === false
        ? "ลบรายการจากแอพแล้ว แต่ใน Sheet ไม่พบแถวนี้"
        : writeResult.configured
          ? "ลบรายการจากแอพและ Sheet แล้ว"
          : "ลบรายการจากแอพแล้ว",
    );
  } catch (error) {
    console.error(error);
    showToast(sheetWriteErrorMessage(error, "ลบไม่สำเร็จ"));
  }
}

function sheetWriteErrorMessage(error, prefix) {
  const message = String(error?.message || "");
  if (message.includes("Session expired")) return "Session หมดอายุ กรุณา Login ใหม่";
  if (message.includes("Missing")) return `${prefix} แต่ Render ยังตั้งค่า Environment ไม่ครบ`;
  if (message.includes("Apps Script")) return `${prefix} แต่ Apps Script ยังไม่พร้อมใช้งาน`;
  return `${prefix} แต่ส่งเข้า Sheet ไม่สำเร็จ`;
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
  const activeHoldings = activePortfolioHoldings();
  el.dashSellPrice.textContent = price ? money(price.sell) : "-";
  el.dashBuyPrice.textContent = price ? money(price.buy) : "-";
  el.dashPriceTime.textContent = price ? `${formatShortDate(price.date)} ${price.time}` : "ยังไม่มีข้อมูล";
  el.dashWeight.textContent = `${formatNumber(totals.weight)} บาท`;
  el.dashItemCount.textContent = `${activeHoldings.length} รายการ`;
  el.dashUnrealized.textContent = signedMoney(totals.unrealized);
  el.dashUnrealized.classList.toggle("profit", totals.unrealized > 0);
  el.dashUnrealized.classList.toggle("loss", totals.unrealized < 0);
  el.dashUnrealizedCaption.textContent = totals.cost ? `ทุนรวม ${money(totals.cost)}` : "ยังไม่มีรายการทองสะสม";
  el.sourceBadge.textContent = price ? price.source : "-";

  const dueItems = activeHoldings.filter((holding) => holding.notifySell && holding.notifyDate && holding.notifyDate <= todayKey());
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
  renderPriceFilters();

  if (!state.prices.length) {
    el.priceRows.innerHTML = `<tr><td colspan="5">ยังไม่มีประวัติราคา</td></tr>`;
    return;
  }

  const today = todayKey();
  const todayPrice = latestPriceForDate(today);
  const todayParts = dateParts(today);
  const filtered = state.prices
    .filter((price) => {
      const parts = dateParts(price.date);
      return parts.month === selectedPriceMonth && parts.year === selectedPriceYear;
    })
    .sort(comparePricesNewestFirst);

  const isCurrentMonth = selectedPriceMonth === todayParts.month && selectedPriceYear === todayParts.year;
  const rows =
    isCurrentMonth && todayPrice && !filtered.some((price) => price.id === todayPrice.id)
      ? [todayPrice, ...filtered]
      : filtered;

  if (!rows.length) {
    el.priceRows.innerHTML = `<tr><td colspan="5">ยังไม่มีราคาในเดือนที่เลือก</td></tr>`;
    return;
  }

  el.priceRows.innerHTML = rows
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

function renderPriceFilters() {
  const today = new Date();
  const years = Array.from(
    new Set([today.getFullYear(), ...state.prices.map((price) => dateParts(price.date).year).filter(Boolean)]),
  ).sort((a, b) => b - a);

  el.priceMonth.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const value = index + 1;
    return `<option value="${value}" ${value === selectedPriceMonth ? "selected" : ""}>${thaiMonthName(value)}</option>`;
  }).join("");

  el.priceYear.innerHTML = years
    .map((year) => `<option value="${year}" ${year === selectedPriceYear ? "selected" : ""}>${year + 543}</option>`)
    .join("");
}

function renderHoldings() {
  const activeHoldings = activePortfolioHoldings();

  if (!activeHoldings.length) {
    el.holdingCards.innerHTML = `<div class="empty-state">ยังไม่มีรายการทองสะสม</div>`;
  } else {
    const current = latestPrice();
    const currentSell = current?.sell || 0;

    el.holdingCards.innerHTML = activeHoldings
      .map((item) => renderHoldingCard(item, currentSell))
      .join("");
  }

  el.holdingCards.querySelectorAll("[data-edit-holding]").forEach((button) => {
    button.addEventListener("click", () => openHoldingForm(state.holdings.find((holding) => holding.id === button.dataset.editHolding)));
  });

  el.holdingCards.querySelectorAll("[data-delete-holding]").forEach((button) => {
    button.addEventListener("click", () => deleteHolding(button.dataset.deleteHolding));
  });

  renderSoldHoldings();
}

function renderHoldingCard(item, currentSell) {
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
          <button class="mini-button danger-mini-button" type="button" data-delete-holding="${item.id}" title="ลบ">ลบ</button>
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
}

function renderSoldHoldings() {
  const sales = saleRecords();
  el.soldSection.classList.toggle("hidden", !sales.length);
  if (!sales.length) return;

  el.soldToggleLabel.textContent = `ขายแล้ว (${sales.length} รายการ)`;
  el.soldToggleIcon.textContent = soldSectionOpen ? "⌃" : "⌄";
  el.soldCards.classList.toggle("hidden", !soldSectionOpen);
  if (!soldSectionOpen) {
    el.soldCards.innerHTML = "";
    return;
  }

  el.soldCards.innerHTML = sales.map((sale) => renderSoldCard(sale)).join("");
}

function renderSoldCard(sale) {
  const diffClass = sale.diff > 0 ? "profit" : sale.diff < 0 ? "loss" : "";
  return `
    <article class="holding-card sold-card">
      <header>
        <div>
          <h4>${escapeHtml(sale.name)}</h4>
          <p>ขายวันที่ ${formatShortDate(sale.saleDate)}</p>
        </div>
      </header>
      <div class="holding-stats">
        <div class="stat"><span>จำนวน</span><strong>${formatNumber(sale.weightBaht)} บาท</strong></div>
        <div class="stat"><span>ราคาซื้อรวม</span><strong>${money(sale.buyPrice)}</strong></div>
        <div class="stat"><span>ยอดขาย</span><strong>${money(sale.saleValue)}</strong></div>
        <div class="stat"><span>ส่วนต่างสุทธิ</span><strong class="${diffClass}">${signedMoney(sale.diff)}</strong></div>
      </div>
    </article>
  `;
}

function openSaleHistory() {
  renderSaleHistory();
  el.saleHistoryModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeSaleHistory() {
  el.saleHistoryModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderSaleHistory() {
  const sales = saleRecords();
  if (!sales.length) {
    el.saleHistoryContent.innerHTML = `<div class="empty-state sale-empty">ยังไม่มีประวัติการขาย</div>`;
    return;
  }

  const totals = sales.reduce(
    (summary, sale) => {
      summary.weight += sale.weightBaht;
      summary.buy += sale.buyPrice;
      summary.sale += sale.saleValue;
      summary.diff += sale.diff;
      return summary;
    },
    { weight: 0, buy: 0, sale: 0, diff: 0 },
  );
  const grouped = groupSalesByMonth(sales);

  el.saleHistoryContent.innerHTML = `
    <div class="sale-summary">
      <div><span>จำนวนขายแล้ว</span><strong>${formatNumber(totals.weight)} บาท</strong></div>
      <div><span>ยอดขายรวม</span><strong>${money(totals.sale)}</strong></div>
      <div><span>ทุนรวมที่ขาย</span><strong>${money(totals.buy)}</strong></div>
      <div><span>รวมส่วนต่าง</span><strong class="${totals.diff > 0 ? "profit" : totals.diff < 0 ? "loss" : ""}">${signedMoney(totals.diff)}</strong></div>
    </div>
    <div class="sale-groups">
      ${grouped
        .map(
          (group) => `
            <section class="sale-group">
              <h3>${group.label}</h3>
              <div class="sale-list">
                ${group.items.map((sale) => renderSaleHistoryItem(sale)).join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSaleHistoryItem(sale) {
  const diffClass = sale.diff > 0 ? "profit" : sale.diff < 0 ? "loss" : "";
  return `
    <article class="sale-item">
      <div>
        <strong>${escapeHtml(sale.name)}</strong>
        <p>${formatShortDate(sale.saleDate)} · ${formatNumber(sale.weightBaht)} บาท</p>
      </div>
      <div class="sale-item-values">
        <span>ขาย ${money(sale.saleValue)}</span>
        <strong class="${diffClass}">${signedMoney(sale.diff)}</strong>
      </div>
    </article>
  `;
}

function renderForecast() {
  const price = latestPrice();
  const portfolio = calculatePortfolio();
  renderExternalTrendSummary();

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
  drawExternalTrendChart();
}

function drawPriceChart() {
  const canvas = el.priceChart;
  const prices = [...state.prices].sort((a, b) => a.date.localeCompare(b.date));
  drawLineChart(canvas, prices.map((item) => ({ label: formatShortDate(item.date), tooltipLabel: `${formatShortDate(item.date)} ${item.time || ""}`.trim(), value: item.sell })), {
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
      tooltipLabel: horizon.label,
      value: projectPrice(price.sell, horizon.days, trend.annualRate),
    })),
  );
  drawLineChart(el.forecastChart, points, {
    color: "#2563eb",
    fill: "rgba(37, 99, 235, 0.1)",
    emptyText: "ยังไม่มีข้อมูลคาดการณ์",
  });
}

function renderExternalTrendSummary() {
  if (!el.externalTrendSummary) return;

  if (externalTrend.status === "loading") {
    el.externalTrendSummary.textContent = "กำลังดึงข้อมูลจาก CoinGecko PAX Gold...";
    return;
  }

  if (externalTrend.status === "error") {
    el.externalTrendSummary.textContent = "ดึงแนวโน้มภายนอกไม่สำเร็จ จะแสดงใหม่เมื่ออัพเดทครั้งถัดไป";
    return;
  }

  if (!externalTrend.points.length) {
    el.externalTrendSummary.textContent = "ดึงข้อมูลจาก CoinGecko PAX Gold และแปลงเป็นราคาต่อทอง 1 บาท";
    return;
  }

  const first = externalTrend.points[0];
  const last = externalTrend.points[externalTrend.points.length - 1];
  const diff = last.value - first.value;
  el.externalTrendSummary.textContent = `90 วันล่าสุด: ${money(first.value)} → ${money(last.value)} (${signedMoney(diff)}) · ใช้ USD/THB ${formatNumber(externalTrend.thbRate)}`;
}

function drawExternalTrendChart() {
  if (!el.externalTrendChart) return;

  const points = externalTrend.points.map((point, index) => ({
    label: index === 0 || index === externalTrend.points.length - 1 ? formatShortDate(point.date) : "",
    tooltipLabel: formatShortDate(point.date),
    value: point.value,
  }));

  drawLineChart(el.externalTrendChart, points, {
    color: "#15803d",
    fill: "rgba(21, 128, 61, 0.1)",
    emptyText: externalTrend.status === "loading" ? "กำลังดึงข้อมูลแนวโน้ม" : "ยังไม่มีข้อมูลแนวโน้มภายนอก",
  });
}

function drawLineChart(canvas, points, options = {}) {
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const parentStyle = canvas.parentElement ? window.getComputedStyle(canvas.parentElement) : null;
  const parentPadding =
    (Number.parseFloat(parentStyle?.paddingLeft) || 0) + (Number.parseFloat(parentStyle?.paddingRight) || 0);
  const parentWidth = canvas.parentElement ? Math.max(0, canvas.parentElement.clientWidth - parentPadding) : 0;
  const width = Math.max(Math.floor(Math.max(rect.width || 0, parentWidth, 320)), 280);
  if (!canvas.dataset.baseHeight) canvas.dataset.baseHeight = canvas.getAttribute("height") || "260";
  const height = Number(canvas.dataset.baseHeight) || 260;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
    canvas._chartData = { points, options, coordinates: [], width, height };
    setupChartPointer(canvas);
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
  const coordinates = points.map((point, index) => ({ x: xFor(index), y: yFor(point.value), point, index }));
  canvas._chartData = { points, options, coordinates, width, height };
  setupChartPointer(canvas);

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
    const { x, y } = coordinates[index];
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

  if (canvas._hoverIndex !== null && canvas._hoverIndex !== undefined && coordinates[canvas._hoverIndex]) {
    drawChartTooltip(ctx, coordinates[canvas._hoverIndex], width, height, options.color || "#c28a11");
  }
}

function setupChartPointer(canvas) {
  if (canvas._chartPointerReady) return;
  canvas._chartPointerReady = true;
  const preventSelection = (event) => event.preventDefault();

  canvas.addEventListener("pointermove", (event) => updateChartHover(canvas, event));
  canvas.addEventListener("pointerdown", (event) => updateChartHover(canvas, event));
  canvas.addEventListener("contextmenu", preventSelection);
  canvas.addEventListener("selectstart", preventSelection);
  canvas.addEventListener("copy", preventSelection);
  canvas.addEventListener("touchstart", preventSelection, { passive: false });
  canvas.addEventListener("touchmove", preventSelection, { passive: false });
  canvas.addEventListener("pointerleave", () => {
    if (canvas._hoverIndex === null || canvas._hoverIndex === undefined) return;
    canvas._hoverIndex = null;
    drawLineChart(canvas, canvas._chartData?.points || [], canvas._chartData?.options || {});
  });
}

function updateChartHover(canvas, event) {
  const data = canvas._chartData;
  if (!data?.coordinates?.length) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const nearest = data.coordinates.reduce(
    (best, coordinate) => {
      const distance = Math.hypot(coordinate.x - x, coordinate.y - y);
      return distance < best.distance ? { index: coordinate.index, distance } : best;
    },
    { index: null, distance: Number.POSITIVE_INFINITY },
  );
  const nextIndex = nearest.distance <= 24 ? nearest.index : null;

  if (canvas._hoverIndex === nextIndex) return;
  canvas._hoverIndex = nextIndex;
  drawLineChart(canvas, data.points, data.options);
}

function drawChartTooltip(ctx, coordinate, width, height, color) {
  const label = coordinate.point.tooltipLabel || coordinate.point.label || "";
  const value = money(coordinate.point.value);
  const paddingX = 10;
  ctx.font = "12px system-ui";
  const labelWidth = ctx.measureText(label).width;
  ctx.font = "700 14px system-ui";
  const valueWidth = ctx.measureText(value).width;
  const tooltipWidth = Math.max(labelWidth, valueWidth) + paddingX * 2;
  const tooltipHeight = 48;
  const x = Math.min(Math.max(8, coordinate.x - tooltipWidth / 2), width - tooltipWidth - 8);
  const y = coordinate.y > 72 ? coordinate.y - tooltipHeight - 14 : coordinate.y + 14;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(coordinate.x, 24);
  ctx.lineTo(coordinate.x, height - 38);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(coordinate.x, coordinate.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  roundedRect(ctx, x, y, tooltipWidth, tooltipHeight, 8);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "12px system-ui";
  ctx.fillText(label, x + paddingX, y + 18);
  ctx.font = "700 14px system-ui";
  ctx.fillText(value, x + paddingX, y + 37);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function calculatePortfolio() {
  const currentSell = latestPrice()?.sell || 0;
  return activePortfolioHoldings().reduce(
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

function activePortfolioHoldings() {
  return state.holdings.filter((holding) => !isSoldHolding(holding));
}

function soldPortfolioHoldings() {
  return state.holdings.filter(isSoldHolding);
}

function isSoldHolding(holding) {
  if (Number(holding.sellPrice) > 0) return true;
  return Boolean(holding.notifySell && holding.notifyDate && holding.notifyDate < todayKey());
}

function saleRecords() {
  return soldPortfolioHoldings()
    .map((holding) => saleRecordForHolding(holding))
    .sort((a, b) => `${b.saleDate} ${b.sequence || ""}`.localeCompare(`${a.saleDate} ${a.sequence || ""}`));
}

function saleRecordForHolding(holding) {
  const saleDate = holding.notifyDate || todayKey();
  const priceOnSaleDate = latestPriceForDate(saleDate) || latestPrice();
  const estimatedSaleValue = priceOnSaleDate ? priceOnSaleDate.sell * holding.weightBaht : 0;
  const saleValue = Number(holding.sellPrice) > 0 ? Number(holding.sellPrice) : estimatedSaleValue;
  return {
    ...holding,
    saleDate,
    saleValue,
    diff: saleValue - Number(holding.buyPrice || 0),
  };
}

function groupSalesByMonth(sales) {
  const groups = [];
  const byKey = new Map();
  sales.forEach((sale) => {
    const parts = dateParts(sale.saleDate);
    const key = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    if (!byKey.has(key)) {
      const group = { key, label: `${thaiMonthName(parts.month)} ${parts.year + 543}`, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).items.push(sale);
  });
  return groups.sort((a, b) => b.key.localeCompare(a.key));
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
  return [...state.prices].sort(comparePricesNewestFirst)[0] || null;
}

function latestPriceForDate(date) {
  return state.prices.filter((price) => price.date === date).sort(comparePricesNewestFirst)[0] || null;
}

function comparePricesNewestFirst(a, b) {
  return `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`);
}

function dateParts(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: 0, month: 0, day: 0 };
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function thaiMonthName(month) {
  const date = new Date(2026, month - 1, 1);
  return new Intl.DateTimeFormat("th-TH", { month: "long" }).format(date);
}

function scheduleNotificationChecks() {
  if (notificationTimersStarted) return;
  notificationTimersStarted = true;
  checkDueNotifications();
  setInterval(() => {
    if (isAuthenticated) checkDueNotifications();
  }, 60 * 1000);
  setInterval(() => {
    if (isAuthenticated) syncDataFromSheets(false);
  }, 30 * 60 * 1000);
}

function checkDueNotifications() {
  if (!notificationsEnabled()) return;

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
  notifySystem(title, body);
}

async function toggleNotificationAccess() {
  if (notificationsEnabled()) {
    localStorage.setItem(NOTIFICATION_ENABLED_KEY, "0");
    await cancelNativeNotifications();
    await updateNotificationStatus();
    showToast("ปิดแจ้งเตือนแล้ว");
    return;
  }

  const nativeNotifications = getNativeNotifications();

  try {
    if (nativeNotifications) {
      await ensureNativeNotificationChannel(nativeNotifications);
      const current = await nativeNotifications.checkPermissions();
      const permission = current.display === "granted" ? current : await nativeNotifications.requestPermissions();
      await updateNotificationStatus();

      if (permission.display === "granted") {
        localStorage.setItem(NOTIFICATION_ENABLED_KEY, "1");
        await scheduleNativeNotifications();
        await updateNotificationStatus();
        await notifySystem("AzA Gold", "เปิดแจ้งเตือนแล้ว");
        showToast("เปิดแจ้งเตือนบน Android แล้ว");
      } else {
        showToast("ยังไม่ได้อนุญาต Notification");
      }
      return;
    }

    if (!supportsWebNotifications()) {
      showToast(webNotificationUnsupportedMessage());
      updateNotificationStatus();
      return;
    }

    const result = await Notification.requestPermission();
    if (result === "granted") localStorage.setItem(NOTIFICATION_ENABLED_KEY, "1");
    updateNotificationStatus();
    if (result === "granted") {
      await notifySystem("AzA Gold", "เปิดแจ้งเตือนแล้ว");
      showToast("เปิดแจ้งเตือนแล้ว");
    } else {
      showToast("ยังไม่ได้อนุญาต Notification");
    }
  } catch (error) {
    console.error(error);
    showToast("เปิดแจ้งเตือนไม่สำเร็จ กรุณาตรวจสิทธิ์ในระบบ");
    updateNotificationStatus();
  }
}

async function updateNotificationStatus() {
  const nativeNotifications = getNativeNotifications();
  const enabled = notificationsEnabled();

  if (nativeNotifications) {
    try {
      const permission = await nativeNotifications.checkPermissions();
      if (permission.display === "granted" && enabled) {
        setNotificationToggleState("enabled", "🔔 เปิดแจ้งเตือนอยู่", "Native Notification เปิดอยู่");
      } else if (permission.display === "granted") {
        setNotificationToggleState("off", "🔕 เปิดแจ้งเตือน", "Native Notification ปิดอยู่ในแอพ");
      } else {
        setNotificationToggleState("off", "🔕 เปิดแจ้งเตือน", "Native Notification ยังไม่ได้เปิด");
      }
    } catch {
      setNotificationToggleState("off", "🔕 เปิดแจ้งเตือน", "Native Notification ยังไม่ได้เปิด");
    }
    return;
  }

  if (!supportsWebNotifications()) {
    setNotificationToggleState("unsupported", "🔕 ไม่รองรับแจ้งเตือน", webNotificationUnsupportedMessage());
  } else if (Notification.permission === "granted" && enabled) {
    setNotificationToggleState("enabled", "🔔 เปิดแจ้งเตือนอยู่", "Notification เปิดอยู่");
  } else if (Notification.permission === "granted") {
    setNotificationToggleState("off", "🔕 เปิดแจ้งเตือน", "Notification ปิดอยู่ในแอพ");
  } else if (Notification.permission === "denied") {
    setNotificationToggleState("denied", "🚫 เปิดไม่ได้", "Notification ถูกปิดในเบราว์เซอร์");
  } else {
    setNotificationToggleState("off", "🔕 เปิดแจ้งเตือน", "Notification ยังไม่ได้เปิด");
  }
}

function setNotificationToggleState(stateName, buttonText, statusText) {
  el.enableNotifications.textContent = buttonText;
  el.enableNotifications.classList.toggle("notification-on", stateName === "enabled");
  el.enableNotifications.classList.toggle("notification-off", stateName === "off");
  el.enableNotifications.classList.toggle("notification-denied", stateName === "denied" || stateName === "unsupported");
  el.notificationStatus.textContent = statusText;
}

function notificationsEnabled() {
  return localStorage.getItem(NOTIFICATION_ENABLED_KEY) === "1";
}

function supportsWebNotifications() {
  return "Notification" in window && window.isSecureContext;
}

function webNotificationUnsupportedMessage() {
  if (isIosDevice() && !isStandaloneApp()) {
    return "iOS/Safari ต้องเพิ่มเว็บไปหน้า Home Screen ก่อน";
  }
  return "เบราว์เซอร์นี้ยังไม่รองรับ Notification";
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function getNativeNotifications() {
  return window.Capacitor?.Plugins?.LocalNotifications || null;
}

async function ensureNativeNotificationChannel(nativeNotifications) {
  if (!nativeNotifications.createChannel) return;
  await nativeNotifications.createChannel({
    id: NATIVE_NOTIFICATION_CHANNEL_ID,
    name: "AzA Gold",
    description: "ราคาทองและแจ้งเตือนขายทอง",
    importance: 5,
    visibility: 1,
    sound: "default",
  });
}

async function notifySystem(title, body) {
  if (!notificationsEnabled()) return;

  const nativeNotifications = getNativeNotifications();
  if (nativeNotifications) {
    try {
      const permission = await nativeNotifications.checkPermissions();
      if (permission.display !== "granted") return;
      await nativeNotifications.schedule({
        notifications: [
          {
            id: notificationId(`now:${Date.now()}:${title}:${body}`),
            title,
            body,
            channelId: NATIVE_NOTIFICATION_CHANNEL_ID,
            autoCancel: true,
          },
        ],
      });
    } catch (error) {
      console.error(error);
    }
    return;
  }

  if (!supportsWebNotifications() || Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, { body, tag: `${title}-${body}` });
    } else {
      new Notification(title, { body, tag: `${title}-${body}` });
    }
  } catch {
    new Notification(title, { body, tag: `${title}-${body}` });
  }
}

async function scheduleNativeNotifications() {
  const nativeNotifications = getNativeNotifications();
  if (!nativeNotifications) return;

  const permission = await nativeNotifications.checkPermissions();
  if (permission.display !== "granted") return;

  if (!notificationsEnabled()) {
    await cancelNativeNotifications();
    return;
  }

  await cancelNativeNotifications();
  const totals = calculatePortfolio();
  const notifications = [
    {
      id: DAILY_NOTIFICATION_ID,
      title: "AzA Gold",
      body: `ราคาทองรายวัน 09.00 น. · ส่วนต่างล่าสุด ${signedMoney(totals.unrealized)}`,
      channelId: NATIVE_NOTIFICATION_CHANNEL_ID,
      autoCancel: true,
      schedule: { on: { hour: 9, minute: 0 }, repeats: true, allowWhileIdle: true },
    },
  ];

  state.holdings
    .filter((holding) => holding.notifySell && holding.notifyDate && holding.notifyDate >= todayKey())
    .forEach((holding, index) => {
      ["09:05", "12:00"].forEach((time) => {
        notifications.push({
          id: notificationId(`sell:${holding.id}:${holding.notifyDate}:${time}`),
          title: "AzA Gold",
          body: `ขายทองรายการที่ ${index + 1}: ${holding.name}`,
          channelId: NATIVE_NOTIFICATION_CHANNEL_ID,
          autoCancel: true,
          schedule: { at: dateTimeFromParts(holding.notifyDate, time), allowWhileIdle: true },
        });
      });
    });

  await nativeNotifications.schedule({ notifications });
}

async function cancelNativeNotifications() {
  const nativeNotifications = getNativeNotifications();
  if (!nativeNotifications) return;

  const pending = await nativeNotifications.getPending();
  const scheduledIds = pending.notifications
    .map((notification) => notification.id)
    .filter((id) => id >= NATIVE_NOTIFICATION_ID_MIN && id <= NATIVE_NOTIFICATION_ID_MAX);
  if (scheduledIds.length) {
    await nativeNotifications.cancel({ notifications: scheduledIds.map((id) => ({ id })) });
  }
}

function syncNativeNotificationSchedule() {
  if (!getNativeNotifications()) return;
  scheduleNativeNotifications().catch((error) => console.error(error));
}

function notificationId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return NATIVE_NOTIFICATION_ID_MIN + (hash % (NATIVE_NOTIFICATION_ID_MAX - NATIVE_NOTIFICATION_ID_MIN));
}

function dateTimeFromParts(date, time) {
  return new Date(`${date}T${time}:00`);
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
      syncNativeNotificationSchedule();
      showToast("นำเข้าข้อมูลแล้ว");
    } catch (error) {
      console.error(error);
      showToast("ไฟล์ backup ไม่ถูกต้อง");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
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
