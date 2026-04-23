const GROWTH_MARKET_API =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1&sparkline=false&price_change_percentage=24h";
const GROWTH_TRENDING_API = "https://api.coingecko.com/api/v3/search/trending";
const GROWTH_MARKET_CACHE_KEY = "cryptoTrackerMarketCache";
const GROWTH_FX_CACHE_KEY = "cryptoTrackerFxCache";
const GROWTH_RISK_KEY = "cryptoTrackerRiskAccepted";
const GROWTH_LAST_VIEWED_KEY = "cryptoTrackerLastViewedCoin";
const GROWTH_RECENT_ASSETS_KEY = "cryptoTrackerRecentViewedAssets";
const PAPER_TRADING_STORAGE_KEY = "cryptoPaperTradingState";
const PAPER_LEADERBOARD_STORAGE_KEY = "cryptoPaperTradingLeaderboard";
const PAPER_CHALLENGE_STORAGE_KEY = "cryptoPaperTradingChallenge";
const DEFAULT_USD_TO_INR = 83;

const trustModal = document.getElementById("trustModal");
const acceptRiskButton = document.getElementById("acceptRiskButton");
const exitRiskButton = document.getElementById("exitRiskButton");
const lastViewedLink = document.getElementById("lastViewedLink");
const recentAssetsList = document.getElementById("recentAssetsList");

let marketCoins = [];
let trendingCoins = [];
let usdToInrRate = loadState(GROWTH_FX_CACHE_KEY, { usdToInr: DEFAULT_USD_TO_INR }).usdToInr || DEFAULT_USD_TO_INR;

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function restoreRiskModal() {
  const accepted = localStorage.getItem(GROWTH_RISK_KEY) === "true";
  trustModal?.classList.toggle("visible", !accepted);
}

function bindRiskModal() {
  acceptRiskButton?.addEventListener("click", () => {
    localStorage.setItem(GROWTH_RISK_KEY, "true");
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
  const lastViewed = loadState(GROWTH_LAST_VIEWED_KEY, null);
  if (!lastViewedLink || !lastViewed) {
    return;
  }

  lastViewedLink.textContent = `Last viewed on homepage: ${lastViewed.name} (${lastViewed.symbol.toUpperCase()})`;
}

function trackRecentAsset(asset) {
  if (!asset) {
    return;
  }

  const recentAssets = loadState(GROWTH_RECENT_ASSETS_KEY, []);
  const nextAssets = [
    {
      id: asset.id,
      name: asset.name,
      symbol: asset.symbol,
    },
    ...recentAssets.filter((item) => item.id !== asset.id),
  ].slice(0, 8);

  saveState(GROWTH_RECENT_ASSETS_KEY, nextAssets);
  renderRecentAssets();
}

function renderRecentAssets() {
  if (!recentAssetsList) {
    return;
  }

  const recentAssets = loadState(GROWTH_RECENT_ASSETS_KEY, []);
  if (!recentAssets.length) {
    recentAssetsList.innerHTML = '<span class="empty-inline">No recent assets viewed yet.</span>';
    return;
  }

  recentAssetsList.innerHTML = recentAssets
    .map((asset) => `<span class="token-chip">${asset.name} (${asset.symbol.toUpperCase()})</span>`)
    .join("");
}

async function fetchUsdToInrRate() {
  if (usdToInrRate && usdToInrRate !== DEFAULT_USD_TO_INR) {
    return;
  }

  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`FX request failed with status ${response.status}`);
    }

    const data = await response.json();
    const liveRate = data.rates?.INR;
    if (!liveRate) {
      throw new Error("Missing INR rate");
    }

    usdToInrRate = liveRate;
    saveState(GROWTH_FX_CACHE_KEY, { usdToInr: liveRate, timestamp: Date.now() });
  } catch (error) {
    console.error("Failed to fetch INR rate:", error);
  }
}

async function fetchMarketData() {
  const cachedMarket = loadState(GROWTH_MARKET_CACHE_KEY, null);
  if (cachedMarket?.coins?.length) {
    marketCoins = cachedMarket.coins;
  }

  try {
    const response = await fetch(GROWTH_MARKET_API, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Market request failed with status ${response.status}`);
    }

    marketCoins = await response.json();
    saveState(GROWTH_MARKET_CACHE_KEY, {
      coins: marketCoins,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch market data:", error);
  }
}

async function fetchTrendingData() {
  try {
    const response = await fetch(GROWTH_TRENDING_API, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Trending request failed with status ${response.status}`);
    }

    const data = await response.json();
    trendingCoins = data.coins || [];
  } catch (error) {
    console.error("Failed to fetch trending data:", error);
    trendingCoins = [];
  }
}

function getPageKey() {
  return document.body.dataset.page || "growth";
}

function calculatePositionSize() {
  const accountBalance = Number(document.getElementById("accountBalance")?.value || 0);
  const riskPercent = Number(document.getElementById("riskPercent")?.value || 0);
  const entryPrice = Number(document.getElementById("entryPrice")?.value || 0);
  const stopLossPrice = Number(document.getElementById("stopLossPrice")?.value || 0);

  const maxLoss = accountBalance * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  const quantity = stopDistance > 0 ? maxLoss / stopDistance : 0;
  const capital = quantity * entryPrice;

  setResult("positionCapitalResult", formatCurrencyInr(capital));
  setResult("positionQuantityResult", quantity.toFixed(6));
  setResult("positionLossResult", formatCurrencyInr(maxLoss));
}

function calculateRiskReward() {
  const entry = Number(document.getElementById("rrEntry")?.value || 0);
  const stopLoss = Number(document.getElementById("rrStopLoss")?.value || 0);
  const target = Number(document.getElementById("rrTarget")?.value || 0);
  const quantity = Number(document.getElementById("rrQuantity")?.value || 1);

  const expectedLoss = Math.abs(entry - stopLoss) * quantity;
  const expectedProfit = Math.abs(target - entry) * quantity;
  const ratio = expectedLoss > 0 ? expectedProfit / expectedLoss : 0;

  setResult("rrRatioResult", ratio > 0 ? `${ratio.toFixed(2)} : 1` : "N/A");
  setResult("rrProfitResult", formatCurrency(expectedProfit));
  setResult("rrLossResult", formatCurrency(expectedLoss));
}

function calculateDailyLossLimit() {
  const accountSize = Number(document.getElementById("dailyAccountSize")?.value || 0);
  const maxDailyLossPercent = Number(document.getElementById("maxDailyLossPercent")?.value || 0);

  const stopTradingLevel = accountSize * (maxDailyLossPercent / 100);
  const recommendedTrades = maxDailyLossPercent <= 1 ? 2 : maxDailyLossPercent <= 2 ? 3 : 4;

  setResult("dailyStopLevelResult", formatCurrencyInr(stopTradingLevel));
  setResult("dailyTradesResult", `${recommendedTrades} disciplined setups`);
}

function calculateGoalGrowth() {
  const startAmount = Number(document.getElementById("goalStartAmount")?.value || 0);
  const targetAmount = Number(document.getElementById("goalTargetAmount")?.value || 0);

  const lowRiskMonthly = 1.08;
  const midRiskMonthly = 1.15;
  const highRiskMonthly = 1.25;

  function estimateMonths(multiplier) {
    if (startAmount <= 0 || targetAmount <= startAmount) {
      return 0;
    }

    return Math.ceil(Math.log(targetAmount / startAmount) / Math.log(multiplier));
  }

  setResult("goalLowRiskResult", `${estimateMonths(lowRiskMonthly)} months`);
  setResult("goalMediumRiskResult", `${estimateMonths(midRiskMonthly)} months`);
  setResult("goalHighRiskResult", `${estimateMonths(highRiskMonthly)} months`);
}

function bindRiskManagementPage() {
  const calculatorIds = [
    "positionSizeForm",
    "riskRewardForm",
    "dailyLossForm",
    "goalGrowthForm",
  ];

  calculatorIds.forEach((formId) => {
    const form = document.getElementById(formId);
    form?.addEventListener("input", saveRiskManagementValues);
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveRiskManagementValues();
      calculatePositionSize();
      calculateRiskReward();
      calculateDailyLossLimit();
      calculateGoalGrowth();
    });
  });

  restoreRiskManagementValues();
  calculatePositionSize();
  calculateRiskReward();
  calculateDailyLossLimit();
  calculateGoalGrowth();
}

function saveRiskManagementValues() {
  const values = {};
  document.querySelectorAll("[data-risk-input]").forEach((input) => {
    values[input.id] = input.value;
  });
  const storage = loadState("cryptoGrowthPages", {});
  storage[getPageKey()] = values;
  saveState("cryptoGrowthPages", storage);
}

function restoreRiskManagementValues() {
  const storage = loadState("cryptoGrowthPages", {});
  const values = storage[getPageKey()] || {};
  Object.entries(values).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) {
      field.value = value;
    }
  });
}

function getPaperTradingState() {
  return loadState(PAPER_TRADING_STORAGE_KEY, {
    initialBalance: 1000,
    cash: 1000,
    category: "crypto",
    positions: {},
    history: [],
  });
}

function savePaperTradingState(state) {
  saveState(PAPER_TRADING_STORAGE_KEY, state);
}

function getPortfolioEquity(state) {
  const openValue = Object.entries(state.positions).reduce((sum, [assetId, position]) => {
    const asset = marketCoins.find((coin) => coin.id === assetId);
    if (!asset) {
      return sum;
    }

    return sum + (position.quantity * asset.current_price);
  }, 0);

  return state.cash + openValue;
}

function renderPaperTrading() {
  const state = getPaperTradingState();
  const balanceValue = document.getElementById("paperBalanceValue");
  const equityValue = document.getElementById("paperEquityValue");
  const pnlValue = document.getElementById("paperPnlValue");
  const positionsWrap = document.getElementById("paperPositions");
  const historyWrap = document.getElementById("paperHistory");
  const challengeWrap = document.getElementById("challengeProgress");
  const leaderboardWrap = document.getElementById("leaderboardList");
  const assetSelect = document.getElementById("paperAssetSelect");
  const categoryNote = document.getElementById("assetCategoryNote");

  if (assetSelect) {
    assetSelect.innerHTML = marketCoins.slice(0, 40).map((coin) => `
      <option value="${coin.id}">${coin.name} (${coin.symbol.toUpperCase()})</option>
    `).join("");
  }

  const equity = getPortfolioEquity(state);
  const pnl = equity - state.initialBalance;

  balanceValue.textContent = formatCurrencyInr(state.cash * usdToInrRate);
  equityValue.textContent = formatCurrencyInr(equity * usdToInrRate);
  pnlValue.textContent = `${formatCurrencyInr(pnl * usdToInrRate)} (${formatPercent(state.initialBalance > 0 ? (pnl / state.initialBalance) * 100 : 0)})`;
  pnlValue.className = pnl >= 0 ? "positive" : "negative";

  if (positionsWrap) {
    const positionRows = Object.entries(state.positions).map(([assetId, position]) => {
      const asset = marketCoins.find((coin) => coin.id === assetId);
      if (!asset) {
        return "";
      }

      const marketValue = position.quantity * asset.current_price;
      const cost = position.quantity * position.averagePrice;
      const openPnl = marketValue - cost;
      return `
        <div class="history-item">
          <strong>${asset.name}</strong>
          <div class="muted-copy">${position.quantity.toFixed(6)} @ ${formatCurrency(position.averagePrice)}</div>
          <div class="${openPnl >= 0 ? "positive" : "negative"}">${formatCurrency(openPnl)} open P/L</div>
        </div>
      `;
    }).filter(Boolean);

    positionsWrap.innerHTML = positionRows.length
      ? positionRows.join("")
      : '<div class="history-item">No open positions yet.</div>';
  }

  if (historyWrap) {
    historyWrap.innerHTML = state.history.length
      ? state.history.slice().reverse().slice(0, 8).map((trade) => `
          <div class="history-item">
            <strong>${trade.side.toUpperCase()} ${trade.assetName}</strong>
            <div class="muted-copy">${trade.quantity.toFixed(6)} @ ${formatCurrency(trade.price)}</div>
            <div class="muted-copy">${new Date(trade.timestamp).toLocaleString()}</div>
          </div>
        `).join("")
      : '<div class="history-item">No trades executed yet.</div>';
  }

  if (categoryNote) {
    categoryNote.textContent = state.category === "crypto"
      ? "Live crypto market data is active using the current CoinGecko integration."
      : "Stocks and ETFs are shown as educational placeholders only because no live stock/ETF API is wired into this project yet.";
  }

  renderChallengeProgress(state, challengeWrap);
  renderLeaderboard(leaderboardWrap);
}

function updateChallengeStatus(state) {
  const challenge = loadState(PAPER_CHALLENGE_STORAGE_KEY, null);
  if (!challenge) {
    return;
  }

  const equity = getPortfolioEquity(state);
  const elapsedDays = Math.max(1, Math.ceil((Date.now() - new Date(challenge.startedAt).getTime()) / (1000 * 60 * 60 * 24)));
  challenge.currentEquity = equity;
  challenge.progressPercent = Math.min((equity / challenge.target) * 100, 100);
  challenge.elapsedDays = elapsedDays;

  if (equity >= challenge.target && !challenge.completedAt) {
    challenge.completedAt = new Date().toISOString();
    const leaderboard = loadState(PAPER_LEADERBOARD_STORAGE_KEY, []);
    leaderboard.unshift({
      name: challenge.name,
      finalEquity: equity,
      percentReturn: state.initialBalance > 0 ? ((equity - state.initialBalance) / state.initialBalance) * 100 : 0,
      completedAt: challenge.completedAt,
    });
    saveState(PAPER_LEADERBOARD_STORAGE_KEY, leaderboard.slice(0, 10));
  }

  saveState(PAPER_CHALLENGE_STORAGE_KEY, challenge);
}

function renderChallengeProgress(state, container) {
  if (!container) {
    return;
  }

  updateChallengeStatus(state);
  const challenge = loadState(PAPER_CHALLENGE_STORAGE_KEY, null);

  if (!challenge) {
    container.innerHTML = '<div class="challenge-item">No active challenge selected.</div>';
    return;
  }

  container.innerHTML = `
    <div class="challenge-item">
      <strong>${challenge.name}</strong>
      <div class="muted-copy">Current equity: ${formatCurrencyInr((challenge.currentEquity || state.initialBalance) * usdToInrRate)}</div>
      <div class="muted-copy">Target: ${formatCurrencyInr(challenge.target * usdToInrRate)}</div>
      <div class="muted-copy">Progress: ${(challenge.progressPercent || 0).toFixed(1)}%</div>
      <div class="muted-copy">Elapsed days: ${challenge.elapsedDays || 0}</div>
    </div>
  `;
}

function renderLeaderboard(container) {
  if (!container) {
    return;
  }

  const leaderboard = loadState(PAPER_LEADERBOARD_STORAGE_KEY, []);
  if (!leaderboard.length) {
    container.innerHTML = '<div class="leaderboard-item">No completed challenges yet.</div>';
    return;
  }

  container.innerHTML = leaderboard.map((entry, index) => `
    <div class="leaderboard-item">
      <strong>#${index + 1} ${entry.name}</strong>
      <div class="muted-copy">${formatCurrencyInr(entry.finalEquity * usdToInrRate)} final equity</div>
      <div class="${entry.percentReturn >= 0 ? "positive" : "negative"}">${formatPercent(entry.percentReturn)}</div>
    </div>
  `).join("");
}

function setPaperBalance(amount) {
  const state = getPaperTradingState();
  const usdAmount = usdToInrRate > 0 ? amount / usdToInrRate : amount / DEFAULT_USD_TO_INR;
  state.initialBalance = usdAmount;
  state.cash = usdAmount;
  state.positions = {};
  state.history = [];
  savePaperTradingState(state);
  renderPaperTrading();
}

function executeTrade(side) {
  const state = getPaperTradingState();
  const assetSelect = document.getElementById("paperAssetSelect");
  const quantityInput = document.getElementById("paperQuantity");
  const selectedAsset = marketCoins.find((coin) => coin.id === assetSelect.value);
  const quantity = Number(quantityInput.value || 0);

  if (state.category !== "crypto") {
    window.alert("Live paper trading is currently available for crypto only in this build.");
    return;
  }

  if (!selectedAsset || !Number.isFinite(quantity) || quantity <= 0) {
    window.alert("Choose an asset and valid quantity.");
    return;
  }

  trackRecentAsset(selectedAsset);
  const cost = selectedAsset.current_price * quantity;

  if (side === "buy") {
    if (state.cash < cost) {
      window.alert("Not enough virtual balance for this trade.");
      return;
    }

    const current = state.positions[selectedAsset.id] || { quantity: 0, averagePrice: 0 };
    const totalCost = (current.quantity * current.averagePrice) + cost;
    const totalQuantity = current.quantity + quantity;
    state.positions[selectedAsset.id] = {
      quantity: totalQuantity,
      averagePrice: totalQuantity > 0 ? totalCost / totalQuantity : 0,
    };
    state.cash -= cost;
  } else {
    const current = state.positions[selectedAsset.id];
    if (!current || current.quantity < quantity) {
      window.alert("Not enough paper position to sell.");
      return;
    }

    current.quantity -= quantity;
    state.cash += cost;
    if (current.quantity <= 0) {
      delete state.positions[selectedAsset.id];
    } else {
      state.positions[selectedAsset.id] = current;
    }
  }

  state.history.push({
    side,
    assetId: selectedAsset.id,
    assetName: selectedAsset.name,
    quantity,
    price: selectedAsset.current_price,
    timestamp: new Date().toISOString(),
  });

  savePaperTradingState(state);
  renderPaperTrading();
}

function startChallenge(name, startBalance, target, days) {
  setPaperBalance(startBalance);
  const startUsd = usdToInrRate > 0 ? startBalance / usdToInrRate : startBalance / DEFAULT_USD_TO_INR;
  const targetUsd = usdToInrRate > 0 ? target / usdToInrRate : target / DEFAULT_USD_TO_INR;
  saveState(PAPER_CHALLENGE_STORAGE_KEY, {
    name,
    startBalance: startUsd,
    target: targetUsd,
    durationDays: days,
    startedAt: new Date().toISOString(),
    currentEquity: startUsd,
    progressPercent: (startUsd / targetUsd) * 100,
    elapsedDays: 0,
  });
  renderPaperTrading();
}

function bindPaperTradingPage() {
  document.querySelectorAll("[data-balance-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Number(button.dataset.balanceSelect);
      setPaperBalance(amount);
    });
  });

  document.getElementById("customBalanceButton")?.addEventListener("click", () => {
    const amount = Number(document.getElementById("customBalanceInput")?.value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Enter a valid custom amount.");
      return;
    }
    setPaperBalance(amount);
  });

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const state = getPaperTradingState();
      state.category = button.dataset.category;
      savePaperTradingState(state);
      document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item === button));
      renderPaperTrading();
    });
  });

  document.getElementById("paperBuyButton")?.addEventListener("click", () => executeTrade("buy"));
  document.getElementById("paperSellButton")?.addEventListener("click", () => executeTrade("sell"));

  document.querySelectorAll("[data-challenge]").forEach((button) => {
    button.addEventListener("click", () => {
      startChallenge(
        button.dataset.challengeName,
        Number(button.dataset.challengeStart),
        Number(button.dataset.challengeTarget),
        Number(button.dataset.challengeDays)
      );
    });
  });

  const state = getPaperTradingState();
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.category);
  });

  renderPaperTrading();
}

function buildStrategyPath(capital, targetAmount, timeframeMonths, maxRiskPercent, mode) {
  const intensity = mode === "conservative" ? 0.35 : mode === "moderate" ? 0.6 : 0.9;
  const monthlyGoal = timeframeMonths > 0 ? ((targetAmount - capital) / timeframeMonths) : 0;
  const positionRisk = maxRiskPercent * intensity;
  const cashReserve = mode === "conservative" ? 55 : mode === "moderate" ? 35 : 20;
  const setupsPerMonth = mode === "conservative" ? 4 : mode === "moderate" ? 8 : 12;

  return {
    title: mode.charAt(0).toUpperCase() + mode.slice(1),
    points: [
      `Target monthly account growth around ${formatCurrencyInr(monthlyGoal * usdToInrRate)} if the plan is on track.`,
      `Keep per-trade risk near ${positionRisk.toFixed(2)}% of capital.`,
      `Hold roughly ${cashReserve}% in reserve for flexibility and drawdown protection.`,
      `Focus on ${setupsPerMonth} high-quality setups per month instead of overtrading.`,
    ],
  };
}

function renderStrategyPlanner() {
  const capital = Number(document.getElementById("assistantCapital")?.value || 0);
  const targetAmount = Number(document.getElementById("assistantTarget")?.value || 0);
  const timeframeMonths = Number(document.getElementById("assistantTimeframe")?.value || 0);
  const maxRiskPercent = Number(document.getElementById("assistantRisk")?.value || 0);
  const preferredAssets = document.getElementById("assistantAssets")?.value || "";

  const paths = [
    buildStrategyPath(capital, targetAmount, timeframeMonths, maxRiskPercent, "conservative"),
    buildStrategyPath(capital, targetAmount, timeframeMonths, maxRiskPercent, "moderate"),
    buildStrategyPath(capital, targetAmount, timeframeMonths, maxRiskPercent, "aggressive"),
  ];

  const plannerWrap = document.getElementById("assistantPaths");
  const planWrap = document.getElementById("suggestedTradePlan");
  const preferredList = preferredAssets.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);

  plannerWrap.innerHTML = paths.map((path) => `
    <article class="assistant-path">
      <h3>${path.title} Path</h3>
      <ul class="muted-list">
        ${path.points.map((point) => `<li>${point}</li>`).join("")}
      </ul>
    </article>
  `).join("");

  const candidate = findBestTradeCandidate(preferredList);
  if (!candidate) {
    planWrap.innerHTML = '<div class="assistant-path">No strong market candidate available from the current data set.</div>';
    return;
  }

  trackRecentAsset(candidate);
  const stopDistance = candidate.current_price * 0.04;
  const targetDistance = candidate.current_price * (candidate.price_change_percentage_24h > 4 ? 0.12 : 0.08);

  planWrap.innerHTML = `
    <article class="assistant-path">
      <h3>Suggested Trade Plan Example</h3>
      <ul class="muted-list">
        <li>Asset: ${candidate.name} (${candidate.symbol.toUpperCase()})</li>
        <li>Entry zone: ${formatCurrency(candidate.current_price * 0.985)} to ${formatCurrency(candidate.current_price)}</li>
        <li>Stop loss zone: ${formatCurrency(candidate.current_price - stopDistance)}</li>
        <li>Target zone: ${formatCurrency(candidate.current_price + targetDistance)}</li>
        <li>Context: ${candidate.price_change_percentage_24h > 0 ? "positive momentum" : "watch for confirmation before action"}</li>
      </ul>
    </article>
  `;
}

function findBestTradeCandidate(preferredList = []) {
  const ranked = [...marketCoins]
    .filter((coin) => typeof coin.price_change_percentage_24h === "number")
    .sort((a, b) => {
      const scoreA = (a.price_change_percentage_24h || 0) + ((a.total_volume || 0) / 1_000_000_000);
      const scoreB = (b.price_change_percentage_24h || 0) + ((b.total_volume || 0) / 1_000_000_000);
      return scoreB - scoreA;
    });

  if (!preferredList.length) {
    return ranked[0];
  }

  return ranked.find((coin) => preferredList.some((asset) => coin.name.toLowerCase().includes(asset) || coin.symbol.toLowerCase().includes(asset))) || ranked[0];
}

function renderMarketScan() {
  const trendingWrap = document.getElementById("scanTrending");
  const volatilityWrap = document.getElementById("scanVolatility");
  const momentumWrap = document.getElementById("scanMomentum");

  const volatility = [...marketCoins]
    .map((coin) => {
      const range = Math.max((coin.high_24h ?? coin.current_price) - (coin.low_24h ?? coin.current_price), 0);
      return {
        ...coin,
        volatilityScore: coin.current_price > 0 ? range / coin.current_price : 0,
      };
    })
    .sort((a, b) => b.volatilityScore - a.volatilityScore)
    .slice(0, 5);

  const momentum = [...marketCoins]
    .filter((coin) => typeof coin.price_change_percentage_24h === "number")
    .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
    .slice(0, 5);

  trendingWrap.innerHTML = trendingCoins.length
    ? trendingCoins.slice(0, 5).map((entry) => `<div class="scan-item">${entry.item.name} (${entry.item.symbol})</div>`).join("")
    : '<div class="scan-item">Trending feed unavailable.</div>';

  volatilityWrap.innerHTML = volatility.map((coin) => `
    <div class="scan-item">${coin.name} · ${(coin.volatilityScore * 100).toFixed(1)}% daily range</div>
  `).join("");

  momentumWrap.innerHTML = momentum.map((coin) => `
    <div class="scan-item">${coin.name} · ${formatPercent(coin.price_change_percentage_24h)}</div>
  `).join("");
}

function bindAiTradingPage() {
  const form = document.getElementById("assistantForm");
  form?.addEventListener("input", saveAssistantValues);
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAssistantValues();
    renderStrategyPlanner();
  });

  restoreAssistantValues();
  renderMarketScan();
  renderStrategyPlanner();
}

function saveAssistantValues() {
  const values = {};
  document.querySelectorAll("[data-assistant-input]").forEach((input) => {
    values[input.id] = input.value;
  });
  const storage = loadState("cryptoGrowthPages", {});
  storage[getPageKey()] = values;
  saveState("cryptoGrowthPages", storage);
}

function restoreAssistantValues() {
  const storage = loadState("cryptoGrowthPages", {});
  const values = storage[getPageKey()] || {};
  Object.entries(values).forEach(([id, value]) => {
    const field = document.getElementById(id);
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

async function initGrowthPage() {
  restoreRiskModal();
  bindRiskModal();
  restoreLastViewedCoin();
  renderRecentAssets();
  await fetchUsdToInrRate();
  await Promise.all([fetchMarketData(), fetchTrendingData()]);

  const pageKey = getPageKey();

  if (pageKey === "risk-management") {
    bindRiskManagementPage();
  }

  if (pageKey === "paper-trading") {
    bindPaperTradingPage();
  }

  if (pageKey === "ai-trading") {
    bindAiTradingPage();
  }
}

initGrowthPage();
