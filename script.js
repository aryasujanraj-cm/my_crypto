const API_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=false&price_change_percentage=24h";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";
const NEWS_URL = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
const FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1&format=json";
const USD_TO_INR_URL = "https://api.frankfurter.app/latest?from=USD&to=INR";
const HISTORY_DAYS = 7;
const REFRESH_INTERVAL_MS = 60000;
const MAX_CHART_POINTS = 20;
const ALERT_THRESHOLD_PERCENT = 2;
const ALERT_LIFETIME_MS = 5000;
const CHART_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/chart.js";

const PORTFOLIO_STORAGE_KEY = "cryptoTrackerPortfolio";
const MARKET_CACHE_KEY = "cryptoTrackerMarketCache";
const WATCHLIST_STORAGE_KEY = "cryptoTrackerWatchlist";
const RECENT_SEARCHES_STORAGE_KEY = "cryptoTrackerRecentSearches";
const RISK_ACCEPTED_STORAGE_KEY = "cryptoTrackerRiskAccepted";
const EMAIL_SIGNUPS_STORAGE_KEY = "cryptoTrackerEmailSignups";
const LAST_VIEWED_COIN_STORAGE_KEY = "cryptoTrackerLastViewedCoin";
const FX_CACHE_KEY = "cryptoTrackerFxCache";
const AFFILIATE_URL = "https://invite.coindcx.com/61707419";
const DEFAULT_USD_TO_INR = 83;

const tableBody = document.getElementById("cryptoTableBody");
const searchInput = document.getElementById("searchInput");
const searchDropdown = document.getElementById("searchDropdown");
const clearSearchButton = document.getElementById("clearSearchButton");
const statusBadge = document.getElementById("statusBadge");
const lastUpdated = document.getElementById("lastUpdated");
const chartTitle = document.getElementById("chartTitle");
const chartStatus = document.getElementById("chartStatus");
const chartWrap = document.getElementById("chartWrap");
const priceChartCanvas = document.getElementById("priceChart");
const portfolioTableBody = document.getElementById("portfolioTableBody");
const portfolioTotal = document.getElementById("portfolioTotal");
const portfolioInvested = document.getElementById("portfolioInvested");
const portfolioProfitLoss = document.getElementById("portfolioProfitLoss");
const investmentAmountInput = document.getElementById("investmentInput");
const recommendButton = document.getElementById("recommendButton");
const bestCoinName = document.getElementById("bestCoinName");
const bestCoinReason = document.getElementById("bestCoinReason");
const bestCoinConfidence = document.getElementById("bestCoinConfidence");
const bestCoinAllocation = document.getElementById("bestCoinAllocation");
const recommendationSummary = document.getElementById("recommendationSummary");
const topRecommendationsList = document.getElementById("topRecommendationsList");
const distributionSuggestion = document.getElementById("distributionSuggestion");
const notificationsPanel = document.getElementById("notificationsPanel");
const recommendAffiliateLink = document.getElementById("recommendAffiliateLink");
const chartAffiliateLink = document.getElementById("chartAffiliateLink");
const recentSearches = document.getElementById("recentSearches");
const watchlistChips = document.getElementById("watchlistChips");
const lastViewedCoin = document.getElementById("lastViewedCoin");
const topGainers = document.getElementById("topGainers");
const topLosers = document.getElementById("topLosers");
const trendingCoins = document.getElementById("trendingCoins");
const newsFeed = document.getElementById("newsFeed");
const marketCapTotal = document.getElementById("marketCapTotal");
const marketVolumeTotal = document.getElementById("marketVolumeTotal");
const marketBullishCount = document.getElementById("marketBullishCount");
const watchlistCount = document.getElementById("watchlistCount");
const heroCoinsTracked = document.getElementById("heroCoinsTracked");
const heroTrendingCount = document.getElementById("heroTrendingCount");
const marketTabAll = document.getElementById("marketTabAll");
const marketTabWatchlist = document.getElementById("marketTabWatchlist");
const trustModal = document.getElementById("trustModal");
const acceptRiskButton = document.getElementById("acceptRiskButton");
const exitRiskButton = document.getElementById("exitRiskButton");
const signupForm = document.getElementById("signupForm");
const emailInput = document.getElementById("emailInput");
const signupMessage = document.getElementById("signupMessage");
const sentimentValue = document.getElementById("sentimentValue");
const sentimentLabel = document.getElementById("sentimentLabel");
const sentimentSummary = document.getElementById("sentimentSummary");

let allCoins = [];
let refreshTimerId = null;
let priceChart = null;
let chartLibraryPromise = null;
let selectedCoinId = null;
let selectedCoinName = "";
let marketRequestInFlight = false;
let newsLoaded = false;
let lastAnalyzedAmount = 0;
let lastAnalyzedCurrency = "USD";
let lastRecommendationMode = "general";
let currentMarketFilter = "all";
let usdToInrRate = loadState(FX_CACHE_KEY, { usdToInr: DEFAULT_USD_TO_INR }).usdToInr || DEFAULT_USD_TO_INR;
let previousCoinPrices = new Map();
let lastAlertDirection = new Map();
let chartHistoryCache = new Map();
let priceHistory = new Map();
let allTrending = [];

let portfolio = loadPortfolio();
let watchlist = loadState(WATCHLIST_STORAGE_KEY, []);
let recentSearchList = loadState(RECENT_SEARCHES_STORAGE_KEY, []);
let emailSignups = loadState(EMAIL_SIGNUPS_STORAGE_KEY, []);
let lastViewedCoinState = loadState(LAST_VIEWED_COIN_STORAGE_KEY, null);

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

function loadPortfolio() {
  const storedPortfolio = loadState(PORTFOLIO_STORAGE_KEY, {});
  const migratedPortfolio = {};

  Object.entries(storedPortfolio || {}).forEach(([coinId, entry]) => {
    if (typeof entry === "number") {
      migratedPortfolio[coinId] = { amount: entry, buyPrice: 0 };
      return;
    }

    migratedPortfolio[coinId] = {
      amount: Number(entry?.amount) || 0,
      buyPrice: Number(entry?.buyPrice) || 0,
    };
  });

  return migratedPortfolio;
}

function savePortfolio() {
  saveState(PORTFOLIO_STORAGE_KEY, portfolio);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1 ? 2 : 4,
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

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value || 0);
}

function formatAmountInCurrency(value, currency) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setMarketLoading(isLoading) {
  tableBody.classList.toggle("loading-table", isLoading);
}

function setChartLoading(isLoading) {
  chartWrap.classList.toggle("loading-chart", isLoading);
}

function updateStatus(text, isError = false) {
  statusBadge.textContent = text;
  statusBadge.style.color = isError ? "#ffd2dc" : "#96a5d0";
  statusBadge.style.borderColor = isError ? "rgba(255, 104, 139, 0.28)" : "rgba(100, 199, 255, 0.18)";
}

function updateChartStatus(text, isError = false) {
  chartStatus.textContent = text;
  chartStatus.style.color = isError ? "#ffd2dc" : "";
}

function saveMarketCache(rawCoins, timestamp = new Date().toISOString()) {
  saveState(MARKET_CACHE_KEY, { timestamp, coins: rawCoins });
}

function loadMarketCache() {
  return loadState(MARKET_CACHE_KEY, null);
}

function scheduleNextFetch(delay = REFRESH_INTERVAL_MS) {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
  }

  refreshTimerId = window.setTimeout(fetchCoins, delay);
}

function calculateAverage(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.length ? total / values.length : 0;
}

function normalizePriceChange(change) {
  if (typeof change !== "number") {
    return 0;
  }

  return clamp((change + 20) / 40, 0, 1);
}

function buildInitialHistory(coin) {
  const currentPrice = coin.current_price;
  const changePercent = coin.price_change_percentage_24h ?? 0;
  const baselinePrice = currentPrice / (1 + changePercent / 100 || 1);

  return [
    baselinePrice * 0.985,
    baselinePrice,
    baselinePrice * 1.015,
    currentPrice * 0.995,
    currentPrice,
  ];
}

function updateCoinSignal(coin) {
  const history = priceHistory.get(coin.id) ?? buildInitialHistory(coin);
  history.push(coin.current_price);

  if (history.length > 6) {
    history.shift();
  }

  priceHistory.set(coin.id, history);

  const sma = calculateAverage(history);
  const signal = coin.current_price < sma ? "BUY" : "SELL";

  return {
    ...coin,
    signal,
    sma,
  };
}

function scoreCoin(coin) {
  const trendScore = coin.current_price >= coin.sma
    ? clamp((coin.current_price - coin.sma) / coin.sma, 0, 0.12) / 0.12
    : 0;
  const momentumScore = normalizePriceChange(coin.price_change_percentage_24h);
  const dayRange = Math.max((coin.high_24h ?? coin.current_price) - (coin.low_24h ?? coin.current_price), 0);
  const volatility = coin.current_price > 0 ? dayRange / coin.current_price : 1;
  const stabilityScore = 1 - clamp(volatility / 0.18, 0, 1);
  const signalScore = coin.signal === "BUY" ? 1 : 0.2;
  const maxVolume = Math.max(...allCoins.map((item) => item.total_volume || 0), 1);
  const volumeScore = clamp((coin.total_volume || 0) / maxVolume, 0, 1);
  const totalScore = (trendScore * 0.35)
    + (momentumScore * 0.25)
    + (stabilityScore * 0.2)
    + (signalScore * 0.1)
    + (volumeScore * 0.1);
  const confidence = Math.round(clamp(totalScore, 0, 1) * 100);

  return {
    ...coin,
    recommendationScore: totalScore,
    confidence,
    label: confidence >= 78 ? "Strong buy" : confidence >= 58 ? "Moderate" : "Watch",
    reason: buildRecommendationReason(coin),
    hasStrongSignal: confidence >= 58,
  };
}

function buildRecommendationReason(coin) {
  const reasons = [];

  if ((coin.price_change_percentage_24h ?? 0) > 4) {
    reasons.push("high momentum");
  } else if ((coin.price_change_percentage_24h ?? 0) > 0) {
    reasons.push("uptrend");
  }

  if (coin.signal === "BUY") {
    reasons.push("buy signal");
  }

  if (coin.current_price < coin.sma) {
    reasons.push("below moving average");
  }

  return reasons.length ? reasons.join(" + ") : "mixed signals";
}

function analyzeRecommendations() {
  return allCoins
    .filter((coin) => {
      const negativeTrend = coin.current_price < coin.sma && (coin.price_change_percentage_24h ?? 0) < 0;
      const suddenSpike = (coin.price_change_percentage_24h ?? 0) > 18;
      return !negativeTrend && !suddenSpike;
    })
    .map(scoreCoin)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 3);
}

function analyzeGeneralRecommendations() {
  const maxMarketCap = Math.max(...allCoins.map((coin) => coin.market_cap || 0), 1);

  return allCoins
    .map((coin) => {
      const marketCapScore = clamp((coin.market_cap || 0) / maxMarketCap, 0, 1);
      const momentumScore = clamp((coin.price_change_percentage_24h || 0) / 12, 0, 1);
      const dayRange = Math.max((coin.high_24h ?? coin.current_price) - (coin.low_24h ?? coin.current_price), 0);
      const volatility = coin.current_price > 0 ? dayRange / coin.current_price : 1;
      const stabilityScore = 1 - clamp(volatility / 0.18, 0, 1);
      const score = (marketCapScore * 0.45) + (momentumScore * 0.3) + (stabilityScore * 0.25);

      return {
        ...coin,
        confidence: Math.round(clamp(score, 0, 1) * 100),
        generalScore: score,
        label: score >= 0.72 ? "Strong buy" : score >= 0.5 ? "Moderate" : "Watch",
        reason: "market cap + positive 24h change + stability",
      };
    })
    .filter((coin) => (coin.price_change_percentage_24h ?? 0) > 0)
    .sort((a, b) => b.generalScore - a.generalScore)
    .slice(0, 3);
}

function buildAllocationSuggestion(amount, count, currency) {
  if (!amount || !count) {
    return "--";
  }

  return `${formatAmountInCurrency(amount / count, currency)} each across ${count} coins`;
}

function renderTopRecommendations(recommendations) {
  if (!recommendations.length) {
    topRecommendationsList.innerHTML =
      '<p class="empty-state recommendation-empty">No recommendations available yet.</p>';
    return;
  }

  topRecommendationsList.innerHTML = recommendations
    .map((coin, index) => `
      <article class="recommendation-item">
        <span class="recommendation-rank">${index + 1}</span>
        <div>
          <div>${coin.name}</div>
          <div class="muted-copy">${coin.label} · ${coin.reason}</div>
        </div>
        <div>
          <strong>${coin.confidence}%</strong>
          <div class="muted-copy">Confidence</div>
        </div>
      </article>
    `)
    .join("");
}

function renderRecommendations(amount = 0, currency = "USD", mode = "general") {
  const investmentRecommendations = analyzeRecommendations();
  const generalRecommendations = analyzeGeneralRecommendations();

  lastAnalyzedAmount = amount;
  lastAnalyzedCurrency = currency;
  lastRecommendationMode = mode;

  if (!allCoins.length) {
    bestCoinName.textContent = "Waiting for market data";
    bestCoinReason.textContent = "Live prices have not loaded yet, so the recommendation engine is standing by.";
    bestCoinConfidence.textContent = "--";
    bestCoinAllocation.textContent = "--";
    recommendationSummary.textContent = "No analysis available yet.";
    distributionSuggestion.textContent = "Distribution suggestion will appear here.";
    renderTopRecommendations([]);
    return;
  }

  if (mode === "general") {
    const topCoin = generalRecommendations[0];

    if (!topCoin) {
      bestCoinName.textContent = "Top coins unavailable";
      bestCoinReason.textContent = "Market conditions do not currently support a strong general recommendation.";
      bestCoinConfidence.textContent = "--";
      bestCoinAllocation.textContent = "--";
      recommendationSummary.textContent = "No strong general recommendation available.";
      distributionSuggestion.textContent = "Try again after the next refresh.";
      renderTopRecommendations([]);
      return;
    }

    bestCoinName.textContent = "Top coins right now";
    bestCoinReason.textContent = `${topCoin.name} leads on market cap, positive momentum, and relative stability.`;
    bestCoinConfidence.textContent = `${topCoin.confidence}% confidence`;
    bestCoinAllocation.textContent = "--";
    recommendationSummary.textContent = "General mode is active. Add an amount to switch into investment mode.";
    distributionSuggestion.textContent = "Add a valid amount to see a suggested split.";
    renderTopRecommendations(generalRecommendations);
    return;
  }

  const topCoin = investmentRecommendations[0];
  const strongCoins = investmentRecommendations.filter((coin) => coin.hasStrongSignal);

  if (!topCoin) {
    renderRecommendations(0, "USD", "general");
    return;
  }

  if (!strongCoins.length) {
    bestCoinName.textContent = "No strong buy signal";
    bestCoinReason.textContent = "Current market conditions are mixed. Momentum or entry quality is not strong enough for a high-confidence signal.";
    bestCoinConfidence.textContent = `${topCoin.confidence}%`;
    bestCoinAllocation.textContent = "--";
    recommendationSummary.textContent = "Scanner result: no coin currently clears the strong-buy threshold.";
    distributionSuggestion.textContent = "Suggestion: wait for stronger alignment before allocating fresh capital.";
    renderTopRecommendations(investmentRecommendations);
    return;
  }

  bestCoinName.textContent = topCoin.name;
  bestCoinReason.textContent = `${topCoin.label} · ${topCoin.reason}`;
  bestCoinConfidence.textContent = `${topCoin.confidence}% confidence`;
  bestCoinAllocation.textContent = amount > 0 ? formatAmountInCurrency(amount * 0.5, currency) : "Add amount";
  recommendationSummary.textContent = `Best match right now: ${topCoin.name} with ${topCoin.confidence}% confidence based on trend, momentum, stability, signal, and volume.`;
  distributionSuggestion.textContent = amount > 0
    ? `Suggested split: ${buildAllocationSuggestion(amount, Math.min(3, strongCoins.length), currency)}`
    : "Enter an investment amount to see a suggested split across the top picks.";
  renderTopRecommendations(strongCoins);
}

function renderMarketSummary() {
  if (!allCoins.length) {
    return;
  }

  const totalMarketCap = allCoins.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);
  const totalVolume = allCoins.reduce((sum, coin) => sum + (coin.total_volume || 0), 0);
  const bullish = allCoins.filter((coin) => (coin.price_change_percentage_24h ?? 0) >= 0).length;

  marketCapTotal.textContent = formatCompactCurrency(totalMarketCap);
  marketVolumeTotal.textContent = formatCompactCurrency(totalVolume);
  marketBullishCount.textContent = `${bullish}/${allCoins.length}`;
  watchlistCount.textContent = String(watchlist.length);
  heroCoinsTracked.textContent = String(allCoins.length);
  heroTrendingCount.textContent = String(allTrending.length || Math.min(7, allCoins.length));
}

function renderRecentSearches() {
  if (!recentSearchList.length) {
    recentSearches.innerHTML = '<span class="empty-inline">No recent searches yet.</span>';
    return;
  }

  recentSearches.innerHTML = recentSearchList
    .map((term) => `<button class="token-chip" type="button" data-recent-search="${term}">${term}</button>`)
    .join("");
}

function renderWatchlistChips() {
  if (!watchlist.length) {
    watchlistChips.innerHTML = '<span class="empty-inline">No watchlist coins saved.</span>';
    watchlistCount.textContent = "0";
    return;
  }

  watchlistChips.innerHTML = watchlist
    .map((coinId) => {
      const coin = allCoins.find((item) => item.id === coinId);
      const label = coin ? `${coin.name} (${coin.symbol.toUpperCase()})` : coinId;

      return `
        <div class="token-chip" data-watchlist-chip="${coinId}" role="button" tabindex="0">
          <span>${label}</span>
          <button type="button" data-remove-watchlist="${coinId}" aria-label="Remove ${label}">x</button>
        </div>
      `;
    })
    .join("");
}

function renderLastViewedCoin() {
  if (!lastViewedCoinState) {
    lastViewedCoin.innerHTML = '<span class="empty-inline">No coin viewed yet.</span>';
    return;
  }

  lastViewedCoin.innerHTML = `
    <button class="token-chip" type="button" data-last-viewed="${lastViewedCoinState.id}">
      ${lastViewedCoinState.name} (${lastViewedCoinState.symbol.toUpperCase()})
    </button>
  `;
}

function saveRecentSearch(term) {
  const normalized = term.trim();

  if (!normalized) {
    return;
  }

  recentSearchList = [normalized, ...recentSearchList.filter((item) => item.toLowerCase() !== normalized.toLowerCase())]
    .slice(0, 8);
  saveState(RECENT_SEARCHES_STORAGE_KEY, recentSearchList);
  renderRecentSearches();
}

function saveLastViewedCoin(coin) {
  if (!coin) {
    return;
  }

  lastViewedCoinState = {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
  };
  saveState(LAST_VIEWED_COIN_STORAGE_KEY, lastViewedCoinState);
  renderLastViewedCoin();
}

function toggleWatchlist(coinId) {
  if (watchlist.includes(coinId)) {
    watchlist = watchlist.filter((item) => item !== coinId);
  } else {
    watchlist = [coinId, ...watchlist].slice(0, 20);
  }

  saveState(WATCHLIST_STORAGE_KEY, watchlist);
  renderWatchlistChips();
  renderMarketSummary();
  renderTable();
}

function getFilteredCoins() {
  const query = searchInput.value.trim().toLowerCase();
  const baseList = currentMarketFilter === "watchlist"
    ? allCoins.filter((coin) => watchlist.includes(coin.id))
    : allCoins;

  return baseList.filter((coin) => {
    return coin.name.toLowerCase().includes(query) || coin.symbol.toLowerCase().includes(query);
  });
}

function renderSearchDropdown() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    searchDropdown.hidden = true;
    searchDropdown.innerHTML = "";
    return;
  }

  const matches = allCoins
    .filter((coin) => coin.name.toLowerCase().includes(query) || coin.symbol.toLowerCase().includes(query))
    .slice(0, 6);

  if (!matches.length) {
    searchDropdown.hidden = true;
    searchDropdown.innerHTML = "";
    return;
  }

  searchDropdown.innerHTML = matches
    .map((coin) => `
      <button class="search-dropdown-item" type="button" data-search-select="${coin.id}">
        <span>${coin.name} (${coin.symbol.toUpperCase()})</span>
        <span>${formatCurrency(coin.current_price)}</span>
      </button>
    `)
    .join("");
  searchDropdown.hidden = false;
}

function renderTable() {
  const coins = getFilteredCoins();

  if (!coins.length) {
    const emptyMessage = currentMarketFilter === "watchlist"
      ? "No watchlist coins match your search."
      : "No coins match your search.";
    tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${emptyMessage}</td></tr>`;
    return;
  }

  tableBody.innerHTML = coins
    .map((coin) => {
      const change = coin.price_change_percentage_24h;
      const changeClass = change >= 0 ? "positive" : "negative";
      const signalClass = coin.signal === "BUY" ? "signal-buy" : "signal-sell";
      const isWatchlisted = watchlist.includes(coin.id);

      return `
        <tr class="${coin.id === selectedCoinId ? "selected-row" : ""}" data-coin-id="${coin.id}" data-coin-name="${coin.name}">
          <td>
            <div class="coin-cell">
              <img class="coin-thumb" src="${coin.image}" alt="${coin.name} logo" loading="lazy">
              <div>
                <div>${coin.name}</div>
                <div class="coin-symbol">${coin.symbol}</div>
              </div>
            </div>
          </td>
          <td class="price">${formatCurrency(coin.current_price)}</td>
          <td class="price">${formatCurrencyInr(coin.current_price * usdToInrRate)}</td>
          <td class="change ${changeClass}">${formatPercent(change)}</td>
          <td class="market-cap">${formatCompactCurrency(coin.market_cap)}</td>
          <td><span class="signal-badge ${signalClass}">${coin.signal}</span></td>
          <td>
            <div class="row-actions">
              <button class="mini-button ${isWatchlisted ? "active-watchlist" : ""}" type="button" data-watchlist-toggle="${coin.id}">
                ${isWatchlisted ? "Saved" : "Watchlist"}
              </button>
              <button class="mini-button" type="button" data-add-portfolio="${coin.id}">Portfolio</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMoverItem(coin) {
  const changeClass = (coin.price_change_percentage_24h ?? 0) >= 0 ? "positive" : "negative";

  return `
    <article class="mover-item">
      <div>
        <div>${coin.name}</div>
        <div class="mover-meta">${formatCurrency(coin.current_price)} · ${formatCurrencyInr(coin.current_price * usdToInrRate)}</div>
      </div>
      <strong class="${changeClass}">${formatPercent(coin.price_change_percentage_24h)}</strong>
    </article>
  `;
}

function renderMovers() {
  if (!allCoins.length) {
    topGainers.innerHTML = '<div class="mover-skeleton"></div><div class="mover-skeleton"></div>';
    topLosers.innerHTML = '<div class="mover-skeleton"></div><div class="mover-skeleton"></div>';
    return;
  }

  const gainers = [...allCoins]
    .filter((coin) => typeof coin.price_change_percentage_24h === "number")
    .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
    .slice(0, 5);
  const losers = [...allCoins]
    .filter((coin) => typeof coin.price_change_percentage_24h === "number")
    .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
    .slice(0, 5);

  topGainers.innerHTML = gainers.map(renderMoverItem).join("");
  topLosers.innerHTML = losers.map(renderMoverItem).join("");
}

function renderTrendingCoins(items = []) {
  if (!items.length) {
    trendingCoins.innerHTML = '<p class="empty-state">Trending data is unavailable right now.</p>';
    return;
  }

  trendingCoins.innerHTML = items
    .slice(0, 7)
    .map((entry, index) => {
      const trendCoin = entry.item;
      const marketCoin = allCoins.find((coin) => coin.id === trendCoin.id || coin.symbol.toLowerCase() === trendCoin.symbol.toLowerCase());
      const usdPrice = marketCoin ? formatCurrency(marketCoin.current_price) : "Price soon";
      const inrPrice = marketCoin ? formatCurrencyInr(marketCoin.current_price * usdToInrRate) : "INR soon";

      return `
        <article class="trend-card" data-trending-coin="${trendCoin.id}">
          <div class="trend-card-top">
            <img class="coin-thumb" src="${trendCoin.small}" alt="${trendCoin.name} logo" loading="lazy">
            <div>
              <span class="trend-rank">Trending #${index + 1}</span>
              <div>${trendCoin.name}</div>
              <div class="coin-symbol">${trendCoin.symbol}</div>
            </div>
          </div>
          <div class="trend-price">${usdPrice}</div>
          <div class="muted-copy">${inrPrice}</div>
        </article>
      `;
    })
    .join("");
}

function renderPortfolio() {
  const portfolioEntries = Object.entries(portfolio)
    .map(([coinId, entry]) => {
      const coin = allCoins.find((item) => item.id === coinId);

      if (!coin || !entry || Number(entry.amount) <= 0) {
        return null;
      }

      const amount = Number(entry.amount) || 0;
      const buyPrice = Number(entry.buyPrice) || 0;
      const currentValue = amount * coin.current_price;
      const investedValue = amount * buyPrice;
      const profitLoss = currentValue - investedValue;
      const profitLossPercent = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;

      return {
        name: coin.name,
        amount,
        buyPrice,
        investedValue,
        currentValue,
        profitLoss,
        profitLossPercent,
      };
    })
    .filter(Boolean);

  const totalValue = portfolioEntries.reduce((sum, entry) => sum + entry.currentValue, 0);
  const totalInvestedValue = portfolioEntries.reduce((sum, entry) => sum + entry.investedValue, 0);
  const totalProfitLossValue = totalValue - totalInvestedValue;
  const totalProfitLossPercent = totalInvestedValue > 0 ? (totalProfitLossValue / totalInvestedValue) * 100 : 0;

  portfolioTotal.textContent = formatCurrency(totalValue);
  portfolioInvested.textContent = formatCurrency(totalInvestedValue);
  portfolioProfitLoss.textContent = `${formatCurrency(totalProfitLossValue)} (${formatPercent(totalProfitLossPercent)})`;
  portfolioProfitLoss.className = totalProfitLossValue >= 0 ? "positive" : "negative";

  if (!portfolioEntries.length) {
    portfolioTableBody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Your portfolio is empty. Add coins from the market table.</td></tr>';
    portfolioProfitLoss.className = "";
    return;
  }

  portfolioTableBody.innerHTML = portfolioEntries
    .map((entry) => {
      const profitLossClass = entry.profitLoss >= 0 ? "positive" : "negative";

      return `
        <tr>
          <td>${entry.name}</td>
          <td>${entry.buyPrice > 0 ? formatCurrency(entry.buyPrice) : "--"}</td>
          <td>${formatAmount(entry.amount)}</td>
          <td>${formatCurrency(entry.investedValue)}</td>
          <td>${formatCurrency(entry.currentValue)}</td>
          <td class="${profitLossClass}">${formatCurrency(entry.profitLoss)} (${formatPercent(entry.profitLossPercent)})</td>
        </tr>
      `;
    })
    .join("");
}

function createNotification({ coinName, percentChange, type, message }) {
  const notification = document.createElement("article");
  const changeClass = type === "gain" ? "positive" : "negative";

  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-header">
      <span>${coinName}</span>
      <span class="${changeClass}">${formatPercent(percentChange)}</span>
    </div>
    <div class="notification-body">${message}</div>
  `;

  notificationsPanel.prepend(notification);

  window.setTimeout(() => {
    notification.classList.add("fade-out");
    window.setTimeout(() => notification.remove(), 350);
  }, ALERT_LIFETIME_MS);
}

function processPriceAlerts(coins) {
  coins.forEach((coin) => {
    const previousPrice = previousCoinPrices.get(coin.id);
    previousCoinPrices.set(coin.id, coin.current_price);

    if (!previousPrice || previousPrice <= 0) {
      return;
    }

    const percentChange = ((coin.current_price - previousPrice) / previousPrice) * 100;
    const nextDirection = percentChange >= ALERT_THRESHOLD_PERCENT
      ? "gain"
      : percentChange <= -ALERT_THRESHOLD_PERCENT
        ? "drop"
        : "neutral";
    const previousDirection = lastAlertDirection.get(coin.id) ?? "neutral";

    if (nextDirection !== "neutral" && nextDirection !== previousDirection) {
      createNotification({
        coinName: coin.name,
        percentChange,
        type: nextDirection,
        message: nextDirection === "gain" ? "Price gained quickly" : "Price dropped quickly",
      });
    }

    lastAlertDirection.set(coin.id, nextDirection);
  });
}

function detectCurrencySymbol(input) {
  const trimmedInput = input.trim();

  if (trimmedInput.startsWith("₹")) {
    return "INR";
  }

  if (trimmedInput.startsWith("€")) {
    return "EUR";
  }

  if (trimmedInput.startsWith("£")) {
    return "GBP";
  }

  if (trimmedInput.startsWith("¥")) {
    return "JPY";
  }

  return "USD";
}

function parseAmount(input) {
  if (!input) {
    return null;
  }

  const cleaned = input.replace(/[₹$€£¥,\s]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isNaN(value) ? null : value;
}

function parseInvestmentInput(rawInput) {
  return {
    currency: detectCurrencySymbol(rawInput),
    amount: parseAmount(rawInput),
  };
}

async function getUsdRateForCurrency(currency) {
  if (currency === "USD") {
    return 1;
  }

  if (currency === "INR") {
    return 1 / usdToInrRate;
  }

  return 1;
}

async function updateInvestmentConversionPreview() {
  const topCoin = analyzeRecommendations()[0];

  if (!topCoin || lastRecommendationMode !== "investment") {
    return;
  }

  const rawInput = investmentAmountInput.value.trim();
  const parsedInput = parseInvestmentInput(rawInput);

  if (parsedInput.amount === null || parsedInput.amount <= 0) {
    return;
  }

  const usdRate = await getUsdRateForCurrency(parsedInput.currency);
  const usdValue = parsedInput.amount * usdRate;
  const cryptoAmount = usdValue / topCoin.current_price;

  bestCoinAllocation.textContent = `${formatAmountInCurrency(parsedInput.amount, parsedInput.currency)} ≈ ${formatCurrency(usdValue)}`;
  recommendationSummary.textContent = `${rawInput} ≈ ${formatCurrency(usdValue)}. You can buy about ${formatAmount(cryptoAmount)} ${topCoin.symbol.toUpperCase()}.`;
}

function updateAffiliateLinks() {
  recommendAffiliateLink.href = AFFILIATE_URL;
  chartAffiliateLink.href = AFFILIATE_URL;

  const topCoin = analyzeRecommendations()[0];
  if (topCoin) {
    recommendAffiliateLink.textContent = `Start investing in ${topCoin.name}`;
  }

  chartAffiliateLink.textContent = selectedCoinName
    ? `Start investing in ${selectedCoinName}`
    : "Start investing in this coin";
}

function formatChartLabel(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLiveTimeLabel(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeChartPoints(pricePoints) {
  return pricePoints.slice(-MAX_CHART_POINTS).map(([timestamp, price]) => ({
    label: formatChartLabel(timestamp),
    value: Number(price.toFixed(2)),
  }));
}

async function ensureChartLibrary() {
  if (window.Chart) {
    return window.Chart;
  }

  if (!chartLibraryPromise) {
    chartLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHART_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(window.Chart);
      script.onerror = () => reject(new Error("Unable to load chart library"));
      document.head.appendChild(script);
    });
  }

  return chartLibraryPromise;
}

async function createChartInstance() {
  if (priceChart) {
    return;
  }

  const Chart = await ensureChartLibrary();

  priceChart = new Chart(priceChartCanvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Price",
          data: [],
          borderColor: "#64c7ff",
          backgroundColor: "rgba(100, 199, 255, 0.16)",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450, easing: "easeOutQuart" },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return formatCurrency(context.parsed.y);
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#96a5d0" },
          grid: { color: "rgba(150, 165, 208, 0.08)" },
        },
        y: {
          ticks: {
            color: "#96a5d0",
            callback(value) {
              return formatCurrency(value);
            },
          },
          grid: { color: "rgba(150, 165, 208, 0.08)" },
        },
      },
    },
  });
}

async function setChartData(points) {
  await createChartInstance();
  priceChart.data.labels = points.map((point) => point.label);
  priceChart.data.datasets[0].data = points.map((point) => point.value);
  priceChart.data.datasets[0].label = `${selectedCoinName} price`;
  priceChart.update();
}

async function appendLiveChartPoint(price) {
  if (!priceChart || !selectedCoinId) {
    return;
  }

  const cachedPoints = chartHistoryCache.get(selectedCoinId);
  if (!cachedPoints?.length) {
    return;
  }

  cachedPoints.push({
    label: formatLiveTimeLabel(),
    value: Number(price.toFixed(2)),
  });

  if (cachedPoints.length > MAX_CHART_POINTS) {
    cachedPoints.shift();
  }

  await setChartData(cachedPoints);
}

async function loadCoinChart(coinId, coinName, options = {}) {
  selectedCoinId = coinId;
  selectedCoinName = coinName;
  chartTitle.textContent = `${coinName} price chart`;
  updateChartStatus("Loading 7-day price history...");
  updateAffiliateLinks();
  renderTable();
  setChartLoading(true);

  const coin = allCoins.find((item) => item.id === coinId);
  saveLastViewedCoin(coin);

  if (options.scrollToChart) {
    chartWrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const cachedPoints = chartHistoryCache.get(coinId);
  if (cachedPoints?.length) {
    await setChartData(cachedPoints);
    updateChartStatus("Showing saved chart data with live updates enabled.");
    setChartLoading(false);
    return;
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}&interval=daily`,
      { headers: { accept: "application/json" } }
    );

    if (!response.ok) {
      throw new Error(`Chart request failed with status ${response.status}`);
    }

    const history = await response.json();
    if (!history.prices?.length) {
      throw new Error("No chart data returned");
    }

    const normalizedPoints = normalizeChartPoints(history.prices);
    chartHistoryCache.set(coinId, normalizedPoints);
    await setChartData(normalizedPoints);
    updateChartStatus("Showing the last 7 days of USD price history.");
  } catch (error) {
    console.error("Failed to fetch chart data:", error);
    updateChartStatus("Unable to load chart data right now.", true);
  } finally {
    setChartLoading(false);
  }
}

function syncTabButtons() {
  marketTabAll.classList.toggle("active", currentMarketFilter === "all");
  marketTabWatchlist.classList.toggle("active", currentMarketFilter === "watchlist");
}

function hideSearchDropdown() {
  searchDropdown.hidden = true;
  searchDropdown.innerHTML = "";
}

async function fetchTrendingCoins() {
  trendingCoins.innerHTML = '<div class="trend-skeleton"></div><div class="trend-skeleton"></div><div class="trend-skeleton"></div>';

  try {
    const response = await fetch(TRENDING_URL, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`Trending request failed with status ${response.status}`);
    }

    const data = await response.json();
    allTrending = data.coins || [];
    renderTrendingCoins(allTrending);
    renderMarketSummary();
  } catch (error) {
    console.error("Failed to fetch trending coins:", error);
    renderTrendingCoins([]);
  }
}

function buildNewsCard(article) {
  const imageUrl = article.imageurl || "https://www.cryptocompare.com/media/37746251/news-placeholder.png";
  const source = article.source_info?.name || article.source || "Crypto source";
  const published = article.published_on
    ? new Date(article.published_on * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  return `
    <a class="news-card" href="${article.url}" target="_blank" rel="noopener noreferrer">
      <img src="${imageUrl}" alt="${article.title}" loading="lazy">
      <h3>${article.title}</h3>
      <p class="muted-copy">${article.body ? `${article.body.slice(0, 110)}...` : "Tap to read the full story."}</p>
      <div class="news-meta">${source}${published ? ` · ${published}` : ""}</div>
    </a>
  `;
}

async function fetchNews() {
  if (newsLoaded) {
    return;
  }

  newsLoaded = true;
  newsFeed.innerHTML = '<div class="news-skeleton"></div><div class="news-skeleton"></div><div class="news-skeleton"></div>';

  try {
    const response = await fetch(NEWS_URL, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`News request failed with status ${response.status}`);
    }

    const data = await response.json();
    const articles = data.Data?.slice(0, 6) || [];

    if (!articles.length) {
      throw new Error("No news returned");
    }

    newsFeed.innerHTML = articles.map(buildNewsCard).join("");
  } catch (error) {
    console.error("Failed to fetch news:", error);
    newsFeed.innerHTML = `
      <article class="news-card">
        <h3>Live news feed unavailable</h3>
        <p class="muted-copy">The site is ready for a news feed, but the public endpoint is currently unavailable. Connect a production news API if you want guaranteed uptime.</p>
        <div class="news-meta">No API key configured</div>
      </article>
    `;
  }
}

async function fetchUsdToInrRate() {
  try {
    const response = await fetch(USD_TO_INR_URL, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`FX request failed with status ${response.status}`);
    }

    const data = await response.json();
    const liveRate = data.rates?.INR;

    if (!liveRate) {
      throw new Error("Missing INR rate");
    }

    usdToInrRate = liveRate;
    saveState(FX_CACHE_KEY, { usdToInr: liveRate, timestamp: Date.now() });
  } catch (error) {
    console.error("Failed to fetch USD to INR rate:", error);
    usdToInrRate = usdToInrRate || DEFAULT_USD_TO_INR;
  }
}

function renderFallbackSentiment() {
  if (!allCoins.length) {
    sentimentValue.textContent = "--";
    sentimentLabel.textContent = "Waiting";
    sentimentSummary.textContent = "Calculating market sentiment from live crypto momentum.";
    return;
  }

  const bullishRatio = allCoins.filter((coin) => (coin.price_change_percentage_24h ?? 0) > 0).length / allCoins.length;
  const averageChange = calculateAverage(allCoins.map((coin) => coin.price_change_percentage_24h ?? 0));
  const score = Math.round(clamp((bullishRatio * 65) + ((averageChange + 8) * 2.2), 0, 100));

  sentimentValue.textContent = String(score);

  if (score >= 75) {
    sentimentLabel.textContent = "Greed";
  } else if (score >= 55) {
    sentimentLabel.textContent = "Positive";
  } else if (score >= 35) {
    sentimentLabel.textContent = "Neutral";
  } else {
    sentimentLabel.textContent = "Fear";
  }

  sentimentSummary.textContent = "Fallback sentiment estimate built from live market momentum, breadth, and 24h direction.";
}

async function fetchSentiment() {
  try {
    const response = await fetch(FEAR_GREED_URL, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`Sentiment request failed with status ${response.status}`);
    }

    const data = await response.json();
    const entry = data.data?.[0];

    if (!entry) {
      throw new Error("No sentiment data returned");
    }

    sentimentValue.textContent = entry.value;
    sentimentLabel.textContent = entry.value_classification || "Sentiment";
    sentimentSummary.textContent = "Using live Fear & Greed Index data with market fallback available if the feed fails.";
  } catch (error) {
    console.error("Failed to fetch sentiment:", error);
    renderFallbackSentiment();
  }
}

function editPortfolioCoin(coinId) {
  const coin = allCoins.find((item) => item.id === coinId);

  if (!coin) {
    return;
  }

  const currentEntry = portfolio[coinId] ?? { amount: 0, buyPrice: 0 };
  const amountInput = window.prompt(`Enter amount of ${coin.name} you own:`, currentEntry.amount || "");

  if (amountInput === null) {
    return;
  }

  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount < 0) {
    window.alert("Please enter a valid amount.");
    return;
  }

  let buyPrice = Number(currentEntry.buyPrice) || 0;

  if (amount > 0) {
    const buyPriceInput = window.prompt(`Enter your buy price for ${coin.name}:`, buyPrice || coin.current_price);

    if (buyPriceInput === null) {
      return;
    }

    buyPrice = Number(buyPriceInput);
    if (!Number.isFinite(buyPrice) || buyPrice < 0) {
      window.alert("Please enter a valid buy price.");
      return;
    }
  }

  if (amount === 0) {
    delete portfolio[coinId];
  } else {
    portfolio[coinId] = { amount, buyPrice };
  }

  savePortfolio();
  renderPortfolio();
}

async function fetchCoins() {
  if (marketRequestInFlight) {
    return;
  }

  marketRequestInFlight = true;
  updateStatus("Refreshing...");
  setMarketLoading(true);

  try {
    const response = await fetch(API_URL, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const marketData = await response.json();
    allCoins = marketData.map(updateCoinSignal);
    saveMarketCache(marketData);
    processPriceAlerts(allCoins);
    renderTable();
    renderPortfolio();
    renderMovers();
    renderTrendingCoins(allTrending);
    renderRecommendations(lastAnalyzedAmount, lastAnalyzedCurrency, lastRecommendationMode);
    renderWatchlistChips();
    renderLastViewedCoin();
    renderSearchDropdown();
    renderMarketSummary();
    renderFallbackSentiment();
    updateAffiliateLinks();

    lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
    updateStatus("Live");

    if (selectedCoinId) {
      const selectedCoin = allCoins.find((coin) => coin.id === selectedCoinId);
      if (selectedCoin) {
        await appendLiveChartPoint(selectedCoin.current_price);
      }
    }
  } catch (error) {
    console.error("Failed to fetch crypto data:", error);
    updateStatus("Temporary issue, showing cached data", true);

    if (!allCoins.length) {
      const cachedMarket = loadMarketCache();

      if (cachedMarket?.coins?.length) {
        allCoins = cachedMarket.coins.map(updateCoinSignal);
        renderTable();
        renderPortfolio();
        renderMovers();
        renderRecommendations(lastAnalyzedAmount, lastAnalyzedCurrency, lastRecommendationMode);
        renderWatchlistChips();
        renderLastViewedCoin();
        renderMarketSummary();
        renderFallbackSentiment();
        updateAffiliateLinks();
        lastUpdated.textContent = `Last updated: ${new Date(cachedMarket.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}`;
      }
    }
  } finally {
    marketRequestInFlight = false;
    setMarketLoading(false);
    scheduleNextFetch(REFRESH_INTERVAL_MS);
  }
}

function restoreRiskModal() {
  const accepted = localStorage.getItem(RISK_ACCEPTED_STORAGE_KEY) === "true";
  trustModal.classList.toggle("visible", !accepted);
}

function detectAndSelectCoin(coinId) {
  const coin = allCoins.find((item) => item.id === coinId);
  if (!coin) {
    return;
  }

  currentMarketFilter = "all";
  syncTabButtons();
  searchInput.value = coin.name;
  saveRecentSearch(coin.name);
  renderTable();
  hideSearchDropdown();
  loadCoinChart(coin.id, coin.name, { scrollToChart: true });
}

function observeNewsSection() {
  if (!newsFeed) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    fetchNews();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        fetchNews();
        observer.disconnect();
      }
    });
  }, { rootMargin: "200px 0px" });

  observer.observe(newsFeed);
}

function bindEvents() {
  searchInput.addEventListener("input", () => {
    renderTable();
    renderSearchDropdown();
  });

  searchInput.addEventListener("focus", renderSearchDropdown);

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    renderTable();
    hideSearchDropdown();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-dropdown-wrap")) {
      hideSearchDropdown();
    }
  });

  searchDropdown.addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-select]");
    if (!button) {
      return;
    }

    detectAndSelectCoin(button.dataset.searchSelect);
  });

  recommendButton.addEventListener("click", async () => {
    const rawInput = investmentAmountInput.value || "";
    const parsedInput = parseInvestmentInput(rawInput);

    if (!rawInput.trim()) {
      renderRecommendations(0, "USD", "general");
      return;
    }

    if (parsedInput.amount === null || parsedInput.amount <= 0) {
      window.alert("Please enter a valid amount.");
      renderRecommendations(0, "USD", "general");
      return;
    }

    renderRecommendations(parsedInput.amount, parsedInput.currency, "investment");
    await updateInvestmentConversionPreview();
  });

  marketTabAll.addEventListener("click", () => {
    currentMarketFilter = "all";
    syncTabButtons();
    renderTable();
  });

  marketTabWatchlist.addEventListener("click", () => {
    currentMarketFilter = "watchlist";
    syncTabButtons();
    renderTable();
  });

  tableBody.addEventListener("click", (event) => {
    const watchlistButton = event.target.closest("[data-watchlist-toggle]");
    if (watchlistButton) {
      event.stopPropagation();
      toggleWatchlist(watchlistButton.dataset.watchlistToggle);
      return;
    }

    const portfolioButton = event.target.closest("[data-add-portfolio]");
    if (portfolioButton) {
      event.stopPropagation();
      editPortfolioCoin(portfolioButton.dataset.addPortfolio);
      return;
    }

    const row = event.target.closest("tr[data-coin-id]");
    if (!row) {
      return;
    }

    saveRecentSearch(row.dataset.coinName);
    hideSearchDropdown();
    loadCoinChart(row.dataset.coinId, row.dataset.coinName);
  });

  recentSearches.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recent-search]");
    if (!button) {
      return;
    }

    searchInput.value = button.dataset.recentSearch;
    renderTable();
    renderSearchDropdown();
  });

  watchlistChips.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-watchlist]");
    if (removeButton) {
      event.stopPropagation();
      toggleWatchlist(removeButton.dataset.removeWatchlist);
      return;
    }

    const chip = event.target.closest("[data-watchlist-chip]");
    if (!chip) {
      return;
    }

    detectAndSelectCoin(chip.dataset.watchlistChip);
  });

  watchlistChips.addEventListener("keydown", (event) => {
    const chip = event.target.closest("[data-watchlist-chip]");
    if (!chip || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    detectAndSelectCoin(chip.dataset.watchlistChip);
  });

  lastViewedCoin.addEventListener("click", (event) => {
    const button = event.target.closest("[data-last-viewed]");
    if (!button) {
      return;
    }

    detectAndSelectCoin(button.dataset.lastViewed);
  });

  trendingCoins.addEventListener("click", (event) => {
    const card = event.target.closest("[data-trending-coin]");
    if (!card) {
      return;
    }

    detectAndSelectCoin(card.dataset.trendingCoin);
  });

  acceptRiskButton.addEventListener("click", () => {
    localStorage.setItem(RISK_ACCEPTED_STORAGE_KEY, "true");
    trustModal.classList.remove("visible");
  });

  exitRiskButton.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.replace("about:blank");
  });

  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
      return;
    }

    emailSignups = [email, ...emailSignups.filter((item) => item !== email)];
    saveState(EMAIL_SIGNUPS_STORAGE_KEY, emailSignups);
    signupMessage.textContent = `${email} saved locally. Connect Mailchimp, ConvertKit, or another ESP to send campaigns in production.`;
    signupForm.reset();
  });
}

function restoreCachedMarket() {
  const cachedMarket = loadMarketCache();

  if (!cachedMarket?.coins?.length) {
    return;
  }

  allCoins = cachedMarket.coins.map(updateCoinSignal);
  renderTable();
  renderPortfolio();
  renderMovers();
  renderRecommendations(0, "USD", "general");
  renderWatchlistChips();
  renderLastViewedCoin();
  renderSearchDropdown();
  renderMarketSummary();
  renderFallbackSentiment();
  updateAffiliateLinks();
  lastUpdated.textContent = `Last updated: ${new Date(cachedMarket.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

async function init() {
  restoreRiskModal();
  renderRecentSearches();
  renderWatchlistChips();
  renderLastViewedCoin();
  syncTabButtons();
  bindEvents();
  restoreCachedMarket();
  await fetchUsdToInrRate();
  fetchCoins();
  fetchTrendingCoins();
  fetchSentiment();
  observeNewsSection();
}

init();
