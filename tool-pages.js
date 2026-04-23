const TOOL_STORAGE_KEY = "cryptoTrackerCalculatorValues";
const TOOL_RISK_KEY = "cryptoTrackerRiskAccepted";
const TOOL_LAST_VIEWED_COIN_KEY = "cryptoTrackerLastViewedCoin";
const TOOL_MARKET_CACHE_KEY = "cryptoTrackerMarketCache";
const TOOL_FX_CACHE_KEY = "cryptoTrackerFxCache";
const TOOL_API_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h";
const TOOL_USD_TO_INR_URL = "https://api.frankfurter.app/latest?from=USD&to=INR";
const TOOL_DEFAULT_USD_TO_INR = 83;

const trustModal = document.getElementById("trustModal");
const acceptRiskButton = document.getElementById("acceptRiskButton");
const exitRiskButton = document.getElementById("exitRiskButton");
const toolForm = document.getElementById("toolForm");
const addEntryButton = document.getElementById("addEntryButton");
const entriesWrap = document.getElementById("entriesWrap");
const selectedCoinSelect = document.getElementById("selectedCoin");
const currentCoinPrice = document.getElementById("currentCoinPrice");
const lastViewedLink = document.getElementById("lastViewedLink");

let calculatorValues = loadState(TOOL_STORAGE_KEY, {});
let marketCoins = [];
let usdToInrRate = loadState(TOOL_FX_CACHE_KEY, { usdToInr: TOOL_DEFAULT_USD_TO_INR }).usdToInr || TOOL_DEFAULT_USD_TO_INR;

function loadState(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return fallbackValue;
  }
}

function saveState(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value || 0);
}

function formatCurrencyInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getPageKey() {
  return document.body.dataset.page || "tool";
}

function restoreRiskModal() {
  const accepted = localStorage.getItem(TOOL_RISK_KEY) === "true";
  trustModal.classList.toggle("visible", !accepted);
}

function bindRiskModal() {
  acceptRiskButton?.addEventListener("click", () => {
    localStorage.setItem(TOOL_RISK_KEY, "true");
    trustModal.classList.remove("visible");
  });

  exitRiskButton?.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.replace("about:blank");
  });
}

function restoreLastViewedCoin() {
  const lastViewed = loadState(TOOL_LAST_VIEWED_COIN_KEY, null);

  if (!lastViewed || !lastViewedLink) {
    return;
  }

  lastViewedLink.textContent = `Last viewed on homepage: ${lastViewed.name} (${lastViewed.symbol.toUpperCase()})`;
}

function saveFormValues() {
  if (!toolForm) {
    return;
  }

  const pageKey = getPageKey();
  const values = {};

  Array.from(toolForm.elements).forEach((element) => {
    if (!element.name) {
      return;
    }

    values[element.name] = element.value;
  });

  calculatorValues[pageKey] = values;
  saveState(TOOL_STORAGE_KEY, calculatorValues);
}

function restoreFormValues() {
  if (!toolForm) {
    return;
  }

  const values = calculatorValues[getPageKey()];
  if (!values) {
    return;
  }

  Object.entries(values).forEach(([name, value]) => {
    const field = toolForm.elements.namedItem(name);
    if (field) {
      field.value = value;
    }
  });
}

function setResult(id, value, className = "") {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  element.textContent = value;
  element.className = className;
}

async function fetchUsdToInrRate() {
  try {
    const response = await fetch(TOOL_USD_TO_INR_URL, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`FX request failed with status ${response.status}`);
    }

    const data = await response.json();
    const liveRate = data.rates?.INR;

    if (!liveRate) {
      throw new Error("Missing INR rate");
    }

    usdToInrRate = liveRate;
    saveState(TOOL_FX_CACHE_KEY, { usdToInr: liveRate, timestamp: Date.now() });
  } catch (error) {
    console.error("Failed to fetch USD to INR rate:", error);
  }
}

async function fetchMarketCoins() {
  const cachedMarket = loadState(TOOL_MARKET_CACHE_KEY, null);
  if (cachedMarket?.coins?.length) {
    marketCoins = cachedMarket.coins;
  }

  try {
    const response = await fetch(TOOL_API_URL, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Market request failed with status ${response.status}`);
    }

    marketCoins = await response.json();
    saveState(TOOL_MARKET_CACHE_KEY, {
      coins: marketCoins,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch market coins:", error);
  }
}

function populateCoinSelect() {
  if (!selectedCoinSelect) {
    return;
  }

  const options = marketCoins.slice(0, 60).map((coin) => `
    <option value="${coin.id}">${coin.name} (${coin.symbol.toUpperCase()})</option>
  `);

  selectedCoinSelect.innerHTML = `
    <option value="solana">Solana (SOL)</option>
    ${options.join("")}
  `;
}

function getCoinPriceById(coinId) {
  const coin = marketCoins.find((item) => item.id === coinId);
  return coin?.current_price || 0;
}

function calculateProfitPage() {
  const buyPrice = Number(toolForm.buyPrice.value || 0);
  const sellPrice = Number(toolForm.sellPrice.value || 0);
  const investmentAmount = Number(toolForm.investmentAmount.value || 0);
  const quantity = Number(toolForm.quantity.value || 0);

  const derivedQuantity = quantity > 0 ? quantity : (buyPrice > 0 ? investmentAmount / buyPrice : 0);
  const invested = quantity > 0 ? buyPrice * quantity : investmentAmount;
  const finalValue = derivedQuantity * sellPrice;
  const profit = finalValue - invested;
  const roi = invested > 0 ? (profit / invested) * 100 : 0;
  const resultClass = profit >= 0 ? "positive" : "negative";

  setResult("profitLossValue", formatCurrency(profit), resultClass);
  setResult("profitRoiValue", formatPercent(roi), resultClass);
  setResult("profitUsdValue", formatCurrency(finalValue));
  setResult("profitInrValue", formatCurrencyInr(finalValue * usdToInrRate));
}

function calculateSipPage() {
  const monthlyInvestment = Number(toolForm.monthlyInvestment.value || 0);
  const years = Number(toolForm.years.value || 0);
  const expectedAnnualReturn = Number(toolForm.expectedAnnualReturn.value || 0);
  const months = years * 12;
  const monthlyRate = expectedAnnualReturn / 12 / 100;
  const invested = monthlyInvestment * months;
  const futureValue = monthlyRate > 0
    ? monthlyInvestment * ((((1 + monthlyRate) ** months) - 1) / monthlyRate) * (1 + monthlyRate)
    : invested;
  const gains = futureValue - invested;

  setResult("sipFutureValue", formatCurrencyInr(futureValue));
  setResult("sipInvestedValue", formatCurrencyInr(invested));
  setResult("sipGainsValue", formatCurrencyInr(gains), gains >= 0 ? "positive" : "negative");
}

function calculateConverterPage() {
  const amount = Number(toolForm.amount.value || 0);
  const fromAsset = toolForm.fromAsset.value;
  const selectedCoinId = toolForm.selectedCoin.value;

  const btcPrice = getCoinPriceById("bitcoin");
  const ethPrice = getCoinPriceById("ethereum");
  const targetCoinPrice = getCoinPriceById(selectedCoinId);

  let usdValue = 0;

  if (fromAsset === "USD") {
    usdValue = amount;
  } else if (fromAsset === "INR") {
    usdValue = usdToInrRate > 0 ? amount / usdToInrRate : 0;
  } else if (fromAsset === "BTC") {
    usdValue = amount * btcPrice;
  } else if (fromAsset === "ETH") {
    usdValue = amount * ethPrice;
  } else if (fromAsset === "selected") {
    usdValue = amount * targetCoinPrice;
  } else {
    usdValue = amount * getCoinPriceById(fromAsset);
  }

  if (currentCoinPrice) {
    currentCoinPrice.textContent = targetCoinPrice
      ? `Live ${selectedCoinId} price: ${formatCurrency(targetCoinPrice)} · ${formatCurrencyInr(targetCoinPrice * usdToInrRate)}`
      : "Live price unavailable.";
  }

  setResult("converterUsdValue", formatCurrency(usdValue));
  setResult("converterInrValue", formatCurrencyInr(usdValue * usdToInrRate));
  setResult("converterBtcValue", btcPrice > 0 ? `${(usdValue / btcPrice).toFixed(8)} BTC` : "N/A");
  setResult("converterEthValue", ethPrice > 0 ? `${(usdValue / ethPrice).toFixed(8)} ETH` : "N/A");
  setResult("converterCoinValue", targetCoinPrice > 0 ? `${(usdValue / targetCoinPrice).toFixed(8)} ${selectedCoinId.toUpperCase()}` : "N/A");
}

function calculateRoiPage() {
  const initialInvestment = Number(toolForm.initialInvestment.value || 0);
  const finalValue = Number(toolForm.finalValue.value || 0);
  const timePeriodYears = Number(toolForm.timePeriodYears.value || 0);
  const profit = finalValue - initialInvestment;
  const roi = initialInvestment > 0 ? (profit / initialInvestment) * 100 : 0;
  const cagr = initialInvestment > 0 && finalValue > 0 && timePeriodYears > 0
    ? (((finalValue / initialInvestment) ** (1 / timePeriodYears)) - 1) * 100
    : 0;
  const resultClass = profit >= 0 ? "positive" : "negative";

  setResult("roiPercentValue", formatPercent(roi), resultClass);
  setResult("roiCagrValue", formatPercent(cagr), cagr >= 0 ? "positive" : "negative");
  setResult("roiProfitValue", formatCurrency(profit), resultClass);
}

function getAverageEntries() {
  return Array.from(entriesWrap.querySelectorAll(".entry-grid")).map((row) => {
    const quantity = Number(row.querySelector('[name="entryQuantity"]').value || 0);
    const price = Number(row.querySelector('[name="entryPrice"]').value || 0);
    return { quantity, price };
  });
}

function calculateAverageBuyPage() {
  const entries = getAverageEntries().filter((entry) => entry.quantity > 0 && entry.price > 0);
  const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalCost = entries.reduce((sum, entry) => sum + (entry.quantity * entry.price), 0);
  const averagePrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

  setResult("averageBuyPriceValue", formatCurrency(averagePrice));
  setResult("averageQuantityValue", totalQuantity.toFixed(8));
  setResult("averageCostValue", formatCurrency(totalCost));
}

function addAverageEntry(quantity = "", price = "") {
  if (!entriesWrap) {
    return;
  }

  const entry = document.createElement("div");
  entry.className = "entry-grid";
  entry.innerHTML = `
    <label>
      Quantity
      <input name="entryQuantity" type="number" min="0" step="any" value="${quantity}" placeholder="0.25">
    </label>
    <label>
      Buy Price
      <input name="entryPrice" type="number" min="0" step="any" value="${price}" placeholder="62000">
    </label>
  `;
  entriesWrap.appendChild(entry);
}

function restoreAverageEntries() {
  if (!entriesWrap) {
    return;
  }

  const savedValues = calculatorValues[getPageKey()];
  const quantities = Array.isArray(savedValues?.entryQuantity) ? savedValues.entryQuantity : savedValues?.entryQuantity ? [savedValues.entryQuantity] : [];
  const prices = Array.isArray(savedValues?.entryPrice) ? savedValues.entryPrice : savedValues?.entryPrice ? [savedValues.entryPrice] : [];

  entriesWrap.innerHTML = "";

  if (!quantities.length && !prices.length) {
    addAverageEntry();
    addAverageEntry();
    addAverageEntry();
    return;
  }

  const maxLength = Math.max(quantities.length, prices.length);
  for (let index = 0; index < maxLength; index += 1) {
    addAverageEntry(quantities[index] || "", prices[index] || "");
  }
}

function saveAverageEntries() {
  const pageKey = getPageKey();
  const entries = getAverageEntries();
  calculatorValues[pageKey] = {
    entryQuantity: entries.map((entry) => entry.quantity || ""),
    entryPrice: entries.map((entry) => entry.price || ""),
  };
  saveState(TOOL_STORAGE_KEY, calculatorValues);
}

function calculateCurrentPage() {
  const pageKey = getPageKey();

  if (pageKey === "profit-calculator") {
    calculateProfitPage();
    return;
  }

  if (pageKey === "sip-calculator") {
    calculateSipPage();
    return;
  }

  if (pageKey === "converter") {
    calculateConverterPage();
    return;
  }

  if (pageKey === "roi-calculator") {
    calculateRoiPage();
    return;
  }

  if (pageKey === "average-buy-calculator") {
    calculateAverageBuyPage();
  }
}

function bindCalculatorEvents() {
  if (!toolForm) {
    return;
  }

  toolForm.addEventListener("input", () => {
    if (getPageKey() === "average-buy-calculator") {
      saveAverageEntries();
    } else {
      saveFormValues();
    }

    calculateCurrentPage();
  });

  toolForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (getPageKey() === "average-buy-calculator") {
      saveAverageEntries();
    } else {
      saveFormValues();
    }

    calculateCurrentPage();
  });

  addEntryButton?.addEventListener("click", () => {
    addAverageEntry();
    saveAverageEntries();
  });
}

async function initToolPage() {
  restoreRiskModal();
  bindRiskModal();
  restoreLastViewedCoin();

  if (getPageKey() === "average-buy-calculator") {
    restoreAverageEntries();
  } else {
    restoreFormValues();
  }

  bindCalculatorEvents();
  await fetchUsdToInrRate();

  if (getPageKey() === "converter") {
    await fetchMarketCoins();
    populateCoinSelect();
    restoreFormValues();
  }

  calculateCurrentPage();
}

initToolPage();
