const tabs = [
  "Portfolio Command Center",
  "Strategy Monitor",
  "Allocation & Rebalance",
  "Risk Factors & Exposure",
  "Correlation & Diversification",
  "Market & Macro Monitor",
  "Backtesting & Research Lab",
  "Strategy Library & Workflow",
  "Daily Risk Report / Decision Log",
];

const fallbackArtifact = {
  as_of_date: "2026-06-04",
  initial_capital: 1000000,
  strategy_count: 0,
  risk_summary: {
    portfolio_sharpe: 0,
    portfolio_volatility: 0,
    portfolio_var_99: 0,
    portfolio_expected_shortfall_95: 0,
    portfolio_max_drawdown: 0,
  },
  portfolio_series: { dates: [], returns: [], cumulative_return: [], drawdown: [] },
  allocation: {
    current_weights: {},
    proposed_weights: {},
    estimated_transaction_cost: 0,
    approval_required: true,
    rationale: "Pending generated artifact.",
  },
  market_monitor: [],
  news_risk: { watch_level: "normal", news_risk_score: 0, items: [] },
  recommendations: [],
  literature_modules: [],
  replication_clone: {},
  literature_strategy_backtests: {},
  strategies: [],
};

function money(value) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function humanize(value, fallback = "Not available") {
  return value ? String(value).replaceAll("_", " ") : fallback;
}

function humanizeFactor(factor, artifact = activeArtifact) {
  const labels = artifact?.factors?.factor_display_labels || {};
  if (labels[factor]) return labels[factor];
  if (factor === "cash") return "Treasury-bill / liquidity proxy exposure";
  return humanize(factor);
}

function operatingMetric(artifact, key) {
  return artifact?.operating_period_risk?.metrics?.[key] || null;
}

function operatingPnlMetric(artifact, key) {
  return artifact?.operating_period_risk?.pnl?.[key] || null;
}

function formatOperatingMetric(metric, { asPct = false, digits = 2 } = {}) {
  if (!metric) return "N/A";
  if (!metric.available || metric.value == null) {
    return `N/A (${metric.observations || 0}/${metric.minimum_observations || "?"} obs)`;
  }
  return asPct ? pct(metric.value, digits) : num(metric.value, digits);
}

function metricNumeric(metric) {
  if (!metric || !metric.available || metric.value == null) return null;
  return Number(metric.value);
}

function canonicalRiskHeadline(artifact = activeArtifact) {
  return artifact?.risk_status_summary?.headline || {};
}

function scopeSummary(artifact, scopeName) {
  return artifact?.risk_status_summary?.scopes?.[scopeName]?.summary || { ok: 0, watch: 0, warning: 0, breach: 0 };
}

function renderTruthDisclosure(artifact = activeArtifact) {
  const disclosure = artifact?.data_classification?.disclosure
    || "Prototype model portfolio · ETF proxy research data · Not live positions or fills";
  const node = document.getElementById("truthDisclosure");
  if (node) node.textContent = disclosure;
  const build = document.getElementById("buildTrace");
  if (build && artifact?.build_metadata) {
    build.textContent = `Build ${artifact.build_metadata.build_id || "n/a"} · Market as of ${artifact.build_metadata.market_as_of || "n/a"}`;
  }
}

function investmentStart(artifact = activeArtifact) {
  return artifact?.investment_context?.start_date || "2026-06-04";
}

function portfolioSeriesForDisplay(artifact = activeArtifact) {
  const live = artifact?.portfolio_series_live;
  if (live?.dates?.length) return live;
  return artifact?.portfolio_series || {};
}

function riskSummaryForDisplay(artifact = activeArtifact) {
  const operating = artifact?.operating_period_risk?.metrics || {};
  return {
    portfolio_sharpe: metricNumeric(operating.portfolio_sharpe),
    portfolio_volatility: metricNumeric(operating.portfolio_volatility),
    portfolio_var_99: metricNumeric(operating.portfolio_var_99),
    portfolio_expected_shortfall_95: metricNumeric(operating.portfolio_expected_shortfall_95),
    portfolio_max_drawdown: metricNumeric(operating.portfolio_max_drawdown),
  };
}

function historicalResearchRiskSummary(artifact = activeArtifact) {
  return artifact?.historical_research_risk_summary || artifact?.risk_summary || {};
}

function renderFactorExposureBars(containerId, exposure = {}, artifact = activeArtifact) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const entries = Object.entries(exposure || {})
    .map(([factor, value]) => [factor, Number(value)])
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8);
  if (!entries.length) {
    el.innerHTML = "<p class='empty-state'>No factor exposure data.</p>";
    return;
  }
  const maxAbs = Math.max(...entries.map(([, value]) => Math.abs(value)), 0.05);
  el.innerHTML = entries.map(([factor, value]) => {
    const width = Math.min(100, Math.abs(value) / maxAbs * 100);
    const title = factor === "cash" ? (artifact?.investment_context?.factor_cash_note || "") : "";
    return `<div class="factor-bar-row" title="${title}">
      <span class="factor-bar-label">${humanizeFactor(factor, artifact)}</span>
      <div class="factor-bar-track"><span class="factor-bar-fill ${value < 0 ? "neg" : ""}" style="width:${width}%"></span></div>
      <strong>${num(value, 3)}</strong>
    </div>`;
  }).join("");
}

function renderFactorNotes(artifact = activeArtifact) {
  const cash = artifact?.factors?.cash_semantics || {};
  const text = [
    cash.note,
    `Treasury-bill / liquidity proxy exposure: ${num(cash.treasury_bill_proxy_exposure, 3)}.`,
    `${cash.residual_cash_display_label || "Unallocated residual cash"}: ${pct(cash.portfolio_residual_cash_weight ?? artifact?.investment_context?.residual_cash_weight ?? 0, 1)}.`,
  ].filter(Boolean).join(" ");
  ["portfolioFactorNote", "riskFactorNote"].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  });
}

function redrawAllCharts(artifact = activeArtifact) {
  if (!artifact) return;
  const series = portfolioSeriesForDisplay(artifact);
  const start = investmentStart(artifact);
  const caption = document.getElementById("pnlChartCaption");
  if (caption) caption.textContent = `Operating period since ${start} · Historical research context in Research Lab`;
  drawDualAxisChart(document.getElementById("pnlCanvas"), series, { label: `Cumulative return since ${start}` });
  renderFactorExposureBars("portfolioFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorExposureBars("riskFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorNotes(artifact);
  if (selectedLiteratureItem?.backtest) renderResearchLabPanels(selectedLiteratureItem);
  if (activeStrategy) {
    drawSeriesReturnAndDrawdown(document.getElementById("strategyCanvas"), activeStrategy.risk_packet?.chart_series || {});
  }
  document.querySelectorAll("[data-spark]").forEach((canvas) => {
    if (canvas.__sparkValues) drawSparkline(canvas, canvas.__sparkValues, canvas.__sparkColor || "#1ac8ff");
  });
}

function installChartObservers(artifact) {
  const targets = ["pnlCanvas", "backtestCanvas", "strategyCanvas"];
  if (typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(debounce(() => redrawAllCharts(artifact), 120));
  targets.forEach((id) => {
    const node = document.getElementById(id);
    if (node) observer.observe(node);
  });
}

function cls(value) {
  return value < 0 ? "negative" : "positive";
}

function icon(name) {
  const paths = {
    portfolio: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-7"/>',
    line: '<path d="M3 17l5-5 4 3 7-9"/><path d="M3 21h18"/>',
    risk: '<path d="M12 3l9 16H3L12 3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
    shield: '<path d="M12 22s7-4 7-10V5l-7-3-7 3v7c0 6 7 10 7 10z"/>',
    activity: '<path d="M3 12h4l3 7 4-14 3 7h4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
    layers: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.activity}</svg>`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function debounce(fn, waitMs = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

async function loadLiveOverlay() {
  const candidates = ["/api/live-summary", "/output/live_overlay.json", "../output/live_overlay.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload.ok === false) continue;
      return payload;
    } catch {
      continue;
    }
  }
  return null;
}

function mergeLiveOverlay(artifact, overlay) {
  if (!overlay) return artifact;
  artifact.live_data_mode = overlay.data_mode || artifact.live_data_mode || "artifact_static";
  artifact.market_monitor = overlay.market_monitor || artifact.market_monitor;
  artifact.news_risk = overlay.news_risk || artifact.news_risk;
  artifact.recommendations = overlay.recommendations || artifact.recommendations;
  artifact.live_refreshed_at = overlay.refreshed_at;
  artifact.live_market_as_of = overlay.market_as_of;
  if (overlay.factor_exposure_current) {
    artifact.factors = artifact.factors || {};
    artifact.factors.portfolio_factor_exposure_current = overlay.factor_exposure_current;
  }
  return artifact;
}

function renderLiveDataState(artifact) {
  const state = document.getElementById("headerDataState");
  if (!state) return;
  const marketAsOf = artifact?.build_metadata?.market_as_of || artifact?.data_classification?.market_as_of || artifact.as_of_date;
  state.textContent = `Research market proxy · yfinance · ${marketAsOf}`;
  state.className = "proxy-state";
  renderTruthDisclosure(artifact);
}

function renderNewsRiskSummary(newsRisk = {}) {
  const el = document.getElementById("newsRiskSummary");
  if (!el) return;
  const items = newsRisk.items || [];
  el.innerHTML = `
    <p>${statusBadge(newsRisk.watch_level || "normal")} News risk score <strong>${newsRisk.news_risk_score || 0}</strong> across ${items.length} headline(s).</p>
    ${items.slice(0, 4).map((item) => `<p><strong>${item.headline}</strong><br><span class="muted-copy">${item.risk_interpretation}</span></p>`).join("") || "<p class='empty-state'>No live news items loaded.</p>"}`;
}

function renderRecommendationPanels(recs = []) {
  const recHtml = recs.map((rec) => `<p>${statusBadge(rec.priority)} <strong>${rec.action}</strong><br>${rec.rationale}</p>`).join("");
  document.getElementById("recommendationList").innerHTML = recHtml || "<p class='empty-state'>No recommendations.</p>";
  document.getElementById("reportRecommendationList").innerHTML = recHtml;
}

async function refreshLiveDataFromServer(artifact) {
  const button = document.getElementById("refreshLiveData");
  if (button) {
    button.disabled = true;
    button.textContent = "Refreshing…";
  }
  try {
    const response = await fetch("/api/refresh-data", { method: "POST" });
    const overlay = await response.json();
    if (!response.ok || overlay.ok === false) throw new Error(overlay.error || "refresh failed");
    mergeLiveOverlay(artifact, overlay);
    renderLiveDataState(artifact);
    renderNewsRiskSummary(artifact.news_risk);
    renderRecommendationPanels(artifact.recommendations);
    renderStaticTables(artifact);
    redrawAllCharts(artifact);
    if (button) button.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (button) button.textContent = "Refresh failed";
    document.getElementById("newsRiskSummary").innerHTML = `<p class="negative">${error.message}. Start run_workstation_server.py --refresh-on-start</p>`;
  } finally {
    if (button) button.disabled = false;
  }
}

function installLiveControls(artifact) {
  const button = document.getElementById("refreshLiveData");
  if (!button) return;
  button.addEventListener("click", () => refreshLiveDataFromServer(artifact));
}

let activeStrategy = null;
let activeArtifact = null;
let activeDrawerView = "overview";
let simulatedWeights = {};
let simulationResult = null;
let localDecisionEvents = [];
let monitorSort = { key: "daily_pnl", direction: "desc" };
let simulationApiAvailable = null;
let selectedLiteratureItem = null;

const strategyCandidateShelf = [
  ["WQ Multi-Alpha ETF Basket", "101 Alphas", "SPY/QQQ/IWM/QUAL/VLUE/MTUM/USMV", "Ranked price-volume alpha blend", "Crowding, turnover, style reversal", "Prototype running"],
  ["Hedge Fund Factor Clone", "Replication", "SPY/IEF/HYG/UUP/DBC/VIX", "Rolling factor regression", "Clone gap, beta concentration", "Prototype running"],
  ["Business Cycle Allocation", "Macro Regime", "SPY/HYG/IEF/BIL/DBC/UUP", "Growth and inflation phase map", "Regime lag, whipsaw", "Prototype running"],
  ["High-Vol Defensive Switch", "Markov Regime", "SPY/USMV/IEF/BIL/HYG", "Volatility and drawdown stress state", "Late de-risking, false stress", "Prototype running"],
  ["Managed Futures Trend Proxy", "Replication/CTA", "SPY/TLT/GLD/DBC/UUP/DBMF", "Cross-asset 63D trend", "Whipsaw, trend reversal", "Prototype running"],
  ["Credit Carry With Stress Gate", "Replication/Macro", "HYG/LQD/BIL/IEF", "Carry when credit regime supportive", "Spread widening, liquidity shock", "Next build"],
  ["Rates Duration Regime", "Business Cycle", "SHY/IEF/TLT/TIP/BIL", "Duration tilt by growth and inflation", "Inflation shock, curve bear steepening", "Next build"],
  ["USD Macro Pressure Sleeve", "JPM Regime", "UUP/FXE/FXY/GLD/BIL", "USD trend and risk-off pressure", "FX policy shock", "Candidate"],
  ["Commodity Inflation Shock", "Business Cycle", "DBC/USO/GLD/UUP/BIL", "Inflation acceleration proxy", "Roll drag, supply reversal", "Candidate"],
  ["Merger Arb Proxy", "Replication/Event", "MNA/BIL/SPY", "Deal-risk ETF proxy with beta filter", "Deal break, event beta", "Candidate"],
  ["Convertible Arb Proxy", "Replication", "CWB/HYG/IEF/SPY", "Credit-equity-vol proxy basket", "Credit stress, vol shock", "Candidate"],
  ["Tail Hedge Crisis Sleeve", "Markov Regime", "VIX/TLT/GLD/BIL", "High-vol activation", "Premium bleed, timing error", "Candidate"],
  ["Quality Value Momentum Rotation", "101 Alphas/Factors", "QUAL/VLUE/MTUM/USMV/SPY", "Style factor rotation", "Factor crash, crowding", "Candidate"],
  ["Risk Parity ETF Overlay", "Regime Allocation", "SPY/TLT/GLD/DBC/BIL", "Vol-scaled cross-asset allocation", "Correlation breakdown", "Candidate"],
];

async function loadArtifact() {
  const candidates = ["/output/dashboard_artifact.json", "../output/dashboard_artifact.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      continue;
    }
  }
  return fallbackArtifact;
}

function setActiveTab(tab) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === tab);
  });
  requestAnimationFrame(() => redrawAllCharts(activeArtifact));
}

function renderGlobalStatusBar(artifact = activeArtifact) {
  const el = document.getElementById("globalStatusBar");
  if (!el || !artifact) return;
  const headline = canonicalRiskHeadline(artifact);
  const meta = artifact.build_metadata || {};
  const quality = artifact.data_quality || {};
  const stale = quality.stale === true;
  el.innerHTML = `
    <span class="status-pill ${headline.blocking_breaches ? "breach" : headline.warnings ? "warn" : "ok"}">
      ${headline.blocking_breaches || 0} breach · ${headline.warnings || 0} warn · ${headline.watch || 0} watch
    </span>
    <span>Operating since <strong>${investmentStart(artifact)}</strong></span>
    <span>Market as of <strong>${meta.market_as_of || artifact.as_of_date || "n/a"}</strong></span>
    <span class="status-muted">Build ${meta.build_id || "n/a"} · Retrieved ${meta.retrieval_timestamp || meta.generated_at || "n/a"}</span>
    <span class="status-muted ${stale ? "stale" : ""}">${stale ? "Stale proxy data" : "Prototype model portfolio · not live fills"}</span>`;
}

function installShellControls() {
  document.getElementById("toggleRiskDrawer")?.addEventListener("click", () => {
    document.getElementById("riskDrawer")?.classList.toggle("collapsed");
  });
}

function renderHistoricalResearchContext(artifact = activeArtifact) {
  const el = document.getElementById("historicalResearchContext");
  if (!el || !artifact) return;
  const hist = historicalResearchRiskSummary(artifact);
  const dq = artifact.data_quality || {};
  const recon = dq.static_current_weight_reconstruction || {};
  el.innerHTML = `
    <div class="research-context-banner">
      <strong>Historical research context (not operating-period PnL)</strong>
      <span>Long-window Sharpe ${num(hist.portfolio_sharpe)} · Vol ${pct(hist.portfolio_volatility || 0, 1)} · Max DD ${pct(hist.portfolio_max_drawdown || 0, 1)} · ${dq.common_portfolio_risk_window_observations || 0} aligned obs</span>
      <span class="status-muted">${recon.label || "Static weight reconstruction"}: ${recon.description || dq.important_note || ""}</span>
    </div>`;
}

function compareMetricDelta(before, after, lowerBetter, turnover) {
  if ((turnover || 0) <= 0.0001) {
    return { label: "No allocation change", className: "neutral" };
  }
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return { label: "N/A", className: "neutral" };
  }
  if (Math.abs(after - before) < 1e-8) {
    return { label: "Unchanged", className: "neutral" };
  }
  const improved = lowerBetter ? Math.abs(after) < Math.abs(before) : after > before;
  const delta = after - before;
  return {
    label: improved ? "Improved" : "Worse",
    className: improved ? "positive" : "negative",
    delta,
  };
}

function renderTabs() {
  const tabbar = document.getElementById("tabbar");
  const tabIcons = ["portfolio", "line", "target", "risk", "layers", "activity", "shield", "layers", "line"];
  tabbar.innerHTML = tabs.map((tab, index) => `<button class="tab-button ${index === 0 ? "active" : ""}" data-tab="${tab}">${icon(tabIcons[index])}<span>${index + 1}. ${tab}</span></button>`).join("");
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));
  installShellControls();
}

function strategyRationale(strategy) {
  const review = strategy.decision_review || {};
  const gate = strategy.correlation_gate || {};
  if (review.summary) return review.summary;
  if (gate.interpretation) return gate.interpretation;
  if (strategy.allocation_eligibility?.summary) return strategy.allocation_eligibility.summary;
  return strategy.hypothesis || "Monitor daily behavior versus hypothesis and limits.";
}

function strategyActionLabel(strategy) {
  const action = strategy.final_action_after_double_check || strategy.recommended_action || "Review";
  const change = (strategy.proposed_weight || 0) - (strategy.current_weight || 0);
  if (Math.abs(change) < 0.0001) return action;
  if (change > 0) return action.includes("Increase") ? action : "Increase Review";
  return action.includes("Reduce") ? action : "Reduce Review";
}

function drawAllocationDonut(canvas, strategies = []) {
  if (!canvas) return;
  const allocated = strategies.filter((strategy) => (strategy.current_weight || 0) > 0);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!allocated.length) return;
  const colors = ["#1ac8ff", "#3bd671", "#ffb020", "#ff5a4f", "#9b7bff", "#58d1c9", "#f472b6", "#a3e635", "#fb7185", "#38bdf8"];
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.38;
  let start = -Math.PI / 2;
  allocated.forEach((strategy, index) => {
    const slice = Math.max(strategy.current_weight || 0, 0) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.fillStyle = colors[index % colors.length];
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fill();
    start += slice;
  });
  ctx.beginPath();
  ctx.fillStyle = oklchToHex(16, 0.027, 205);
  ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(211,234,240,.85)";
  ctx.font = "11px Inter, system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${allocated.length} live`, cx, cy - 2);
  ctx.fillText("strategies", cx, cy + 12);
}

function oklchToHex() {
  return "#1a2430";
}

function renderRebalancePreview(artifact) {
  const el = document.getElementById("rebalancePreviewTable");
  if (!el) return;
  const rows = (artifact.strategies || []).filter((strategy) => strategy.current_weight > 0 || strategy.proposed_weight > 0);
  el.innerHTML = `<tr><th>Strategy</th><th>Current</th><th>Proposed</th><th>Change</th><th>Action</th><th>Rationale</th></tr>` +
    rows.map((strategy) => {
      const change = (strategy.proposed_weight || 0) - (strategy.current_weight || 0);
      return `<tr>
        <td><button class="table-link" data-open-strategy="${strategy.strategy_id}"><strong>${strategy.name}</strong></button></td>
        <td>${pct(strategy.current_weight || 0, 1)}</td>
        <td>${pct(strategy.proposed_weight || 0, 1)}</td>
        <td class="${cls(change)}">${pct(change, 1)}</td>
        <td>${statusBadge(strategyActionLabel(strategy))}</td>
        <td class="wrap-cell">${strategyRationale(strategy)}</td>
      </tr>`;
    }).join("");
  el.querySelectorAll("[data-open-strategy]").forEach((button) => button.addEventListener("click", () => {
    setActiveTab("Allocation & Rebalance");
    renderDrawer(artifact.strategies.find((strategy) => strategy.strategy_id === button.dataset.openStrategy), artifact);
  }));
}

function canonicalNonOkChecks(artifact = activeArtifact) {
  const scopes = artifact?.risk_status_summary?.scopes || {};
  const checks = [];
  Object.values(scopes).forEach((scope) => {
    (scope.checks || []).forEach((check) => {
      if (!["ok", "not_evaluated"].includes(check.status)) checks.push(check);
    });
  });
  const seen = new Set();
  return checks.filter((check) => {
    const id = check.check_id || check.limit_id || `${check.scope}:${check.metric}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function renderCommandRiskLimits(artifact) {
  const el = document.getElementById("commandRiskLimitsTable");
  if (!el) return;
  const checks = canonicalNonOkChecks(artifact).slice(0, 10);
  el.innerHTML = `<tr><th>Metric</th><th>Current</th><th>Limit</th><th>Util.</th><th>Status</th></tr>` +
    checks.map((check) => `<tr>
      <td>${humanize(check.metric)}</td>
      <td>${typeof check.current_value === "number" ? num(check.current_value, 3) : humanize(check.current_value)}</td>
      <td>${typeof check.breach_threshold === "number" ? num(check.breach_threshold, 3) : humanize(check.breach_threshold)}</td>
      <td>${check.utilization != null ? pct(check.utilization, 0) : "—"}</td>
      <td>${statusBadge(check.status)}</td>
    </tr>`).join("") || `<tr><td colspan="5">All configured limits within range on allocated scope.</td></tr>`;
}

function renderCommandCorrelationMini(artifact) {
  const el = document.getElementById("commandCorrelationMini");
  if (!el) return;
  const rows = (artifact.correlation?.matrix || []).slice(0, 6);
  const names = rows.map((row) => row.strategy_id);
  if (!rows.length) {
    el.innerHTML = "";
    return;
  }
  const normalized = rows.map((row) => {
    const out = { strategy: row.name };
    row.values.forEach((value) => { if (names.includes(value.strategy_id)) out[value.strategy_id] = value.correlation; });
    return out;
  });
  renderRealMatrix("commandCorrelationMini", normalized, names, "correlation");
}

function renderCommandMarketMini(artifact) {
  const el = document.getElementById("commandMarketMini");
  if (!el) return;
  el.innerHTML = `<tr><th>Proxy</th><th>Last</th><th>Daily</th><th>Read</th></tr>` +
    (artifact.market_monitor || []).slice(0, 8).map((row) => `<tr>
      <td>${row.ticker}</td>
      <td>${Number(row.last || 0).toFixed(2)}</td>
      <td class="${cls(row.daily_return || 0)}">${pct(row.daily_return || 0, 2)}</td>
      <td class="wrap-cell">${row.risk_interpretation}</td>
    </tr>`).join("");
}

function renderMonitorKpiGrid(artifact) {
  const el = document.getElementById("monitorKpiGrid");
  if (!el) return;
  const strategies = artifact.strategies || [];
  const allocated = strategies.filter((strategy) => strategy.current_weight > 0);
  const warnings = allocated.filter((strategy) => ["watch", "warning"].includes(strategy.live_risk_status || strategy.risk_status)).length;
  const breaches = allocated.filter((strategy) => (strategy.live_risk_status || strategy.risk_status) === "breach").length;
  const avgSharpe = allocated.reduce((sum, strategy) => sum + (strategy.sharpe || 0), 0) / Math.max(allocated.length, 1);
  const avgTurnover = allocated.reduce((sum, strategy) => sum + (strategy.turnover?.annualized_turnover || 0), 0) / Math.max(allocated.length, 1);
  const pending = strategies.filter((strategy) => strategy.human_approval_required).length;
  const avgCost = allocated.reduce((sum, strategy) => sum + (strategy.transaction_cost_drag || strategy.turnover?.annualized_cost_drag || 0), 0) / Math.max(allocated.length, 1);
  const cards = [
    ["Strategies Monitored", strategies.length, ""],
    ["In Warning", warnings, pct(warnings / Math.max(strategies.length, 1), 0)],
    ["Model Breaches", breaches, pct(breaches / Math.max(strategies.length, 1), 0)],
    ["Avg Rolling Sharpe", num(avgSharpe), "Allocated set"],
    ["Avg Turnover", `${num(avgTurnover, 1)}x`, "Annualized"],
    ["Human Reviews Pending", pending, "Across registry"],
    ["Avg Cost Drag", pct(avgCost, 2), "Annualized proxy"],
  ];
  el.innerHTML = cards.map(([label, value, sub]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`).join("");
}

function renderFactorKpiGrid(artifact) {
  const el = document.getElementById("factorKpiGrid");
  if (!el) return;
  const checks = (artifact.risk_limits?.factors?.checks || []).slice(0, 6);
  const cards = checks.map((check) => [
    humanize(check.metric),
    typeof check.current_value === "number" ? num(check.current_value, 2) : humanize(check.current_value),
    check.utilization != null ? `${pct(check.utilization, 0)} of limit` : humanize(check.status),
    check.status,
  ]);
  if (!cards.length) {
    el.innerHTML = `<article class="kpi-card"><span>Factor Limits</span><strong>OK</strong><small>No active factor breaches</small></article>`;
    return;
  }
  el.innerHTML = cards.map(([label, value, sub, status]) => `<article class="kpi-card"><span>${label}</span><strong class="${status === "breach" ? "negative" : status === "watch" ? "warning-text" : ""}">${value}</strong><small>${sub}</small></article>`).join("");
}

function renderCompareAllocationKpis(artifact) {
  const el = document.getElementById("allocationKpis");
  if (!el) return;
  const current = simulationResult?.metricsBefore || {
    sharpe: artifact.risk_summary?.portfolio_sharpe || 0,
    volatility: artifact.risk_summary?.portfolio_volatility || 0,
    var99: artifact.risk_summary?.portfolio_var_99 || 0,
    es95: artifact.risk_summary?.portfolio_expected_shortfall_95 || 0,
    maxDrawdown: artifact.risk_summary?.portfolio_max_drawdown || 0,
  };
  const proposed = simulationResult?.metrics || {
    sharpe: artifact.risk_summary_proposed?.portfolio_sharpe || current.sharpe,
    volatility: artifact.risk_summary_proposed?.portfolio_volatility || current.volatility,
    var99: artifact.risk_summary_proposed?.portfolio_var_99 || current.var99,
    es95: artifact.risk_summary_proposed?.portfolio_expected_shortfall_95 || current.es95,
    maxDrawdown: artifact.risk_summary_proposed?.portfolio_max_drawdown || current.maxDrawdown,
  };
  const corrSummary = artifact.correlation?.summary || {};
  const turnover = simulationResult?.turnover ?? 0;
  const metrics = [
    ["Sharpe (TTM)", current.sharpe, proposed.sharpe, false],
    ["Volatility (Ann.)", current.volatility, proposed.volatility, true],
    ["VaR 99%", current.var99, proposed.var99, true],
    ["Expected Shortfall 95%", current.es95, proposed.es95, true],
    ["Max Drawdown", current.maxDrawdown, proposed.maxDrawdown, true],
    ["Avg |Correlation|", corrSummary.average_abs_correlation || 0, corrSummary.average_abs_correlation || 0, true],
  ];
  el.innerHTML = metrics.map(([label, before, after, lowerBetter]) => {
    const outcome = compareMetricDelta(before, after, lowerBetter, turnover);
    const deltaText = outcome.delta != null
      ? (lowerBetter ? pct(outcome.delta, 2) : num(outcome.delta))
      : "";
    return `<article class="compare-kpi-card">
      <span class="label">${label}</span>
      <strong class="current">${lowerBetter ? pct(before, 2) : num(before)} → ${lowerBetter ? pct(after, 2) : num(after)}</strong>
      <div class="delta ${outcome.className}">${outcome.label}${deltaText ? ` (${deltaText})` : ""}</div>
    </article>`;
  }).join("");
}

function renderApprovalStatusBar(artifact) {
  const el = document.getElementById("approvalStatusBar");
  if (!el) return;
  const decision = artifact.decision_review || {};
  const cost = simulationResult?.estimatedCost ?? artifact.allocation?.estimated_transaction_cost ?? 0;
  const gateBlockers = (simulationResult?.proposalGates || []).filter((gate) => gate.status === "breach");
  const simBlockers = (simulationResult?.checks || []).filter((check) => check.status === "breach");
  const blocked = gateBlockers.length || simBlockers.length;
  const pending = artifact.allocation?.approval_required !== false || blocked;
  el.className = `approval-status-bar ${pending ? "pending" : ""}`;
  el.innerHTML = `
    <div><strong>Est. Transaction Cost</strong><div>${money(cost)}</div></div>
    <div><strong>Optimizer</strong><div>${humanize(simulationResult?.optimizerLabel || artifact.rebalance_simulation?.official_optimizer?.optimizer_label, "Heuristic proposal")}</div></div>
    <div><strong>System Conclusion</strong><div>${humanize(decision.final_decision, "Modify Then Human Review")}</div></div>
    <div><strong>Proposal Gates</strong><div>${blocked ? statusBadge("blocked") : statusBadge("clear")} ${gateBlockers.length ? gateBlockers.map((g) => g.metric).join(", ") : "No hard gate blockers"}</div></div>
    <div><strong>Human Approval</strong><div>${pending ? statusBadge("pending human approval") : statusBadge("ok")} · Execution not authorized</div></div>`;
}

function renderAllocationSidePanels(artifact) {
  const factorCompare = document.getElementById("factorConcentrationCompare");
  const budget = document.getElementById("riskBudgetUsage");
  const warnings = document.getElementById("allocationWarnings");
  if (!factorCompare || !budget || !warnings) return;
  const current = artifact.allocation?.factor_concentration_before_after?.current || artifact.factors?.portfolio_factor_concentration_current || {};
  const proposed = artifact.allocation?.factor_concentration_before_after?.proposed || artifact.factors?.portfolio_factor_concentration_proposed || {};
  factorCompare.innerHTML = [
    ["Top factor", current.top_factor, proposed.top_factor],
    ["Top |exposure|", num(current.top_abs_exposure, 3), num(proposed.top_abs_exposure, 3)],
    ["Gross factor exposure", num(current.gross_factor_exposure, 3), num(proposed.gross_factor_exposure, 3)],
  ].map(([label, before, after]) => `<div><span>${humanize(label)}</span><strong>${before || "—"} → ${after || "—"}</strong></div>`).join("");
  const exposure = artifact.factors?.portfolio_factor_exposure_current || {};
  const maxAbs = Math.max(...Object.values(exposure).map((value) => Math.abs(Number(value) || 0)), 0.01);
  budget.innerHTML = Object.entries(exposure).slice(0, 6).map(([factor, value]) => `<div><span>${humanize(factor)}</span><div class="bar"><span style="width:${clamp(Math.abs(value) / maxAbs * 100, 4, 100)}%"></span></div><strong>${num(value, 3)}</strong></div>`).join("");
  warnings.innerHTML = (artifact.factors?.human_review_alerts || []).slice(0, 5).map((alert) => `<p>${statusBadge("warning")} <strong>${humanize(alert.topic)}</strong><br>${alert.message}</p>`).join("") || "<p>No additional allocation warnings.</p>";
}

function renderAiRiskSummary(artifact, targetId = "aiRiskSummary") {
  const el = document.getElementById(targetId);
  if (!el) return;
  const decision = artifact.decision_review || {};
  const recs = artifact.recommendations || [];
  const impact = (decision.expected_impact?.risk_metric_changes || []).slice(0, 4);
  el.innerHTML = `
    <p><strong>System conclusion:</strong> ${humanize(decision.final_decision, "Modify Then Human Review")}</p>
    <ul>${recs.slice(0, 5).map((rec) => `<li>${rec.action}: ${rec.rationale}</li>`).join("")}</ul>
    <p><strong>Expected metric shifts (official optimizer):</strong></p>
    <ul>${impact.map((metric) => `<li>${humanize(metric.metric)} ${num(metric.current, 3)} → ${num(metric.proposed, 3)} (${metric.expected_outcome})</li>`).join("") || "<li>Run simulation to refresh custom-weight impact.</li>"}</ul>
    <p><strong>Double-check:</strong> ${decision.double_check_summary?.fail || 0} failed gates, ${decision.double_check_summary?.warning || 0} warnings.</p>`;
}

function renderRebalanceTradeList(artifact) {
  const el = document.getElementById("rebalanceTradeList");
  if (!el) return;
  const trades = artifact.allocation?.rebalance_trade_list || [];
  el.innerHTML = `<tr><th>Strategy</th><th>Side</th><th>Weight Δ</th><th>$ Notional</th><th>Est. Cost</th></tr>` +
    trades.slice(0, 12).map((trade) => `<tr>
      <td>${trade.name || trade.strategy_id}</td>
      <td>${humanize(trade.side)}</td>
      <td class="${cls(trade.weight_change || 0)}">${pct(trade.weight_change || 0, 1)}</td>
      <td>${money(trade.dollar_amount || 0)}</td>
      <td>${money(trade.estimated_transaction_cost || 0)}</td>
    </tr>`).join("") || `<tr><td colspan="5">No material trades in current proposal.</td></tr>`;
}

function renderWorkstationPanels(artifact) {
  drawAllocationDonut(document.getElementById("allocationDonutCanvas"), artifact.strategies || []);
  renderRebalancePreview(artifact);
  renderCommandRiskLimits(artifact);
  renderCommandCorrelationMini(artifact);
  renderCommandMarketMini(artifact);
  renderMonitorKpiGrid(artifact);
  renderFactorKpiGrid(artifact);
  renderCompareAllocationKpis(artifact);
  renderApprovalStatusBar(artifact);
  renderAllocationSidePanels(artifact);
  renderAiRiskSummary(artifact, "aiRiskSummary");
  renderAiRiskSummary(artifact, "commandAiSummary");
  renderRebalanceTradeList(artifact);
}

function canvasScale(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width && rect.height && (canvas.width !== rect.width * ratio || canvas.height !== rect.height * ratio)) {
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: rect.width || canvas.width, h: rect.height || canvas.height };
}

function pathFromSeries(ctx, values, x0, y0, width, height, min, max) {
  values.forEach((value, i) => {
    const x = x0 + (i / Math.max(values.length - 1, 1)) * width;
    const y = y0 + (1 - (value - min) / (max - min || 1)) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function downsampleSeries(values, maxPoints) {
  if (values.length <= maxPoints) return values;
  const bucket = values.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => {
    const start = Math.floor(index * bucket);
    const end = Math.max(start + 1, Math.floor((index + 1) * bucket));
    const slice = values.slice(start, end).filter(Number.isFinite);
    return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0;
  });
}

function drawSparkline(canvas, values = [], color = "#1ac8ff") {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  const raw = (values || []).filter(Number.isFinite);
  const series = raw.length > 3 ? downsampleSeries(raw, 48) : raw.length ? raw : [0, 0];
  const min = Math.min(...series);
  const max = Math.max(...series);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(155, 190, 202, .16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.lineTo(w, h * 0.62);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  pathFromSeries(ctx, series, 0, 3, w, h - 6, min, max === min ? min + 1e-6 : max);
  ctx.stroke();
}

function drawDualAxisChart(canvas, series, options = {}) {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  const rawPrimary = series?.cumulative_return || [];
  const rawDrawdown = series?.drawdown || [];
  ctx.clearRect(0, 0, w, h);
  if (!rawPrimary.length) return;
  const maxPoints = Math.max(120, Math.floor(w * 1.2));
  const primary = downsampleSeries(rawPrimary, maxPoints);
  const drawdown = downsampleSeries(rawDrawdown, maxPoints);
  const pad = { l: 44, r: 48, t: 22, b: 24 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  ctx.fillStyle = "rgba(0, 229, 255, .025)";
  ctx.fillRect(pad.l, pad.t, plotW, plotH);
  ctx.strokeStyle = "rgba(160, 205, 218, .13)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }
  const minP = Math.min(...primary, 0);
  const maxP = Math.max(...primary, 0.001);
  ctx.strokeStyle = options.color || "#1ac8ff";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  pathFromSeries(ctx, primary, pad.l, pad.t, plotW, plotH * 0.58, minP, maxP);
  ctx.stroke();
  if (drawdown.length) {
    const minD = Math.min(...drawdown, -0.001);
    ctx.strokeStyle = "#ff5a4f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pathFromSeries(ctx, drawdown, pad.l, pad.t + plotH * 0.64, plotW, plotH * 0.31, minD, 0);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(211, 234, 240, .72)";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText(options.label || "Cumulative return", pad.l, 12);
  ctx.fillStyle = "rgba(255, 102, 88, .86)";
  ctx.fillText("Drawdown", pad.l + 140, 12);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(211, 234, 240, .68)";
  ctx.fillText(pct(maxP, 0), w - 6, pad.t + 8);
  ctx.fillText(pct(minP, 0), w - 6, pad.t + plotH * 0.58);
  if (drawdown.length) {
    ctx.fillStyle = "rgba(255, 102, 88, .78)";
    ctx.fillText(pct(Math.min(...drawdown), 0), w - 6, pad.t + plotH * 0.92);
  }
  ctx.textAlign = "left";
}

function drawGrossNetEquityChart(canvas, dates, grossReturns, netReturns) {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!dates.length || !grossReturns.length || !netReturns.length) {
    ctx.fillStyle = "rgba(211, 234, 240, .72)";
    ctx.font = "12px Inter, system-ui";
    ctx.fillText("Gross and net return series unavailable for this prototype.", 12, 24);
    return;
  }
  const grossCurve = [];
  const netCurve = [];
  let grossWealth = 1;
  let netWealth = 1;
  grossReturns.forEach((value, index) => {
    grossWealth *= 1 + Number(grossReturns[index] || 0);
    netWealth *= 1 + Number(netReturns[index] || 0);
    grossCurve.push(grossWealth - 1);
    netCurve.push(netWealth - 1);
  });
  const maxPoints = Math.max(120, Math.floor(w * 1.2));
  const gross = downsampleSeries(grossCurve, maxPoints);
  const net = downsampleSeries(netCurve, maxPoints);
  const pad = { l: 44, r: 16, t: 22, b: 24 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const minV = Math.min(...gross, ...net, 0);
  const maxV = Math.max(...gross, ...net, 0.001);
  ctx.strokeStyle = "rgba(160, 205, 218, .13)";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#8ea0ad";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pathFromSeries(ctx, gross, pad.l, pad.t, plotW, plotH, minV, maxV);
  ctx.stroke();
  ctx.strokeStyle = "#55d48b";
  ctx.beginPath();
  pathFromSeries(ctx, net, pad.l, pad.t, plotW, plotH, minV, maxV);
  ctx.stroke();
  ctx.fillStyle = "rgba(211, 234, 240, .72)";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText("Gross cumulative return", pad.l, 12);
  ctx.fillStyle = "rgba(85, 212, 139, .9)";
  ctx.fillText("Net after 5 bps/side costs", pad.l + 150, 12);
}

function renderResearchLabPanels(item) {
  if (!item?.backtest) return;
  selectedLiteratureItem = item;
  const backtest = item.backtest;
  const walk = item.walk_forward || {};
  const series = backtest.return_series || {};
  const gross = series.gross_returns || [];
  const net = series.net_returns || [];
  const dates = series.dates || [];
  const caption = document.getElementById("researchLabCaption");
  if (caption) {
    caption.textContent = `${backtest.name} | ${backtest.literature_source || "literature prototype"} | ${dates[0] || "n/a"} to ${dates.at(-1) || "n/a"} | cost drag ${pct(backtest.turnover?.annualized_cost_drag || 0, 2)}`;
  }
  drawGrossNetEquityChart(document.getElementById("backtestCanvas"), dates, gross, net);
  document.getElementById("walkForwardTable").innerHTML = "<tr><th>Train</th><th>Test</th><th>Train Sharpe</th><th>Test Sharpe</th><th>Test Return</th><th>Test Max DD</th></tr>" +
    (walk.windows || []).slice(-12).map((window) => `<tr><td>${window.train_start} → ${window.train_end}</td><td>${window.test_start} → ${window.test_end}</td><td>${num(window.train_sharpe)}</td><td>${num(window.test_sharpe)}</td><td class="${cls(window.test_return || 0)}">${pct(window.test_return || 0, 2)}</td><td class="negative">${pct(window.test_max_drawdown || 0, 2)}</td></tr>`).join("") ||
    "<tr><td colspan='6'>Walk-forward windows unavailable.</td></tr>";
  document.querySelectorAll("[data-literature-strategy]").forEach((row) => {
    row.classList.toggle("selected", Number(row.dataset.literatureStrategy) === (item._index ?? -1));
  });
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values) {
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(values.length - 1, 1));
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[index];
}

function distributionStats(returns) {
  const avg = mean(returns);
  const vol = std(returns);
  const annReturn = avg * 252;
  const annVol = vol * Math.sqrt(252);
  const downside = returns.filter((value) => value < 0);
  const downVol = std(downside.length ? downside : [0]) * Math.sqrt(252);
  const sorted = [...returns].sort((a, b) => a - b);
  const var95 = quantile(returns, 0.05);
  const var99 = quantile(returns, 0.01);
  const es95 = mean(sorted.slice(0, Math.max(1, Math.ceil(returns.length * 0.05))));
  const centered = returns.map((value) => value - avg);
  const skew = mean(centered.map((value) => value ** 3)) / (vol ** 3 || 1);
  const kurt = mean(centered.map((value) => value ** 4)) / (vol ** 4 || 1);
  const curve = returns.reduce((acc, value) => {
    acc.push(acc[acc.length - 1] * (1 + value));
    return acc;
  }, [1]).slice(1);
  let peak = curve[0];
  const drawdowns = curve.map((value) => {
    peak = Math.max(peak, value);
    return value / peak - 1;
  });
  return {
    annReturn,
    annVol,
    sharpe: annVol ? annReturn / annVol : 0,
    sortino: downVol ? annReturn / downVol : 0,
    winRate: returns.filter((value) => value > 0).length / returns.length,
    skew,
    kurt,
    var95,
    var99,
    es95,
    worst: sorted[0],
    best: sorted[sorted.length - 1],
    maxDrawdown: Math.min(...drawdowns),
    currentDrawdown: drawdowns[drawdowns.length - 1],
    curve,
    drawdowns,
  };
}

function drawDistribution(canvas, returns) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!returns.length) {
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText("No validated return series available.", 12, 24);
    return;
  }
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const buckets = 24;
  const counts = Array.from({ length: buckets }, () => 0);
  returns.forEach((value) => {
    const index = Math.min(buckets - 1, Math.max(0, Math.floor(((value - min) / (max - min || 1)) * buckets)));
    counts[index] += 1;
  });
  const maxCount = Math.max(...counts);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 5) * i);
    ctx.lineTo(w, (h / 5) * i);
    ctx.stroke();
  }
  counts.forEach((count, index) => {
    const barW = w / buckets - 3;
    const barH = (count / maxCount) * (h - 30);
    const x = index * (w / buckets) + 1;
    const y = h - barH - 14;
    const mid = min + ((index + 0.5) / buckets) * (max - min);
    ctx.fillStyle = mid < 0 ? "#ff4a36" : "#59cf74";
    ctx.fillRect(x, y, barW, barH);
  });
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.fillText("left tail", 12, h - 4);
  ctx.fillText("right tail", w - 62, h - 4);
}

function drawReturnAndDrawdown(canvas, stats) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 5) * i);
    ctx.lineTo(w, (h / 5) * i);
    ctx.stroke();
  }
  const minCurve = Math.min(...stats.curve);
  const maxCurve = Math.max(...stats.curve);
  ctx.strokeStyle = "#29a8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  stats.curve.forEach((value, i) => {
    const x = (i / (stats.curve.length - 1)) * w;
    const y = 12 + (1 - (value - minCurve) / (maxCurve - minCurve || 1)) * (h * 0.5);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.strokeStyle = "#ff4a36";
  ctx.beginPath();
  stats.drawdowns.forEach((value, i) => {
    const x = (i / (stats.drawdowns.length - 1)) * w;
    const y = h * 0.62 + Math.abs(value / (stats.maxDrawdown || -0.01)) * h * 0.3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawSeriesReturnAndDrawdown(canvas, series) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const curve = series.cumulative_return || [];
  const drawdowns = series.drawdown || [];
  if (!curve.length) return;
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 5) * i);
    ctx.lineTo(w, (h / 5) * i);
    ctx.stroke();
  }
  const minCurve = Math.min(...curve);
  const maxCurve = Math.max(...curve);
  ctx.strokeStyle = "#29a8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  curve.forEach((value, i) => {
    const x = (i / Math.max(curve.length - 1, 1)) * w;
    const y = 12 + (1 - (value - minCurve) / (maxCurve - minCurve || 1)) * (h * 0.5);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  const minDd = Math.min(...drawdowns, -0.001);
  ctx.strokeStyle = "#ff4a36";
  ctx.beginPath();
  drawdowns.forEach((value, i) => {
    const x = (i / Math.max(drawdowns.length - 1, 1)) * w;
    const y = h * 0.62 + Math.abs(value / minDd) * h * 0.3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawRolling(canvas, returns) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const window = 42;
  const rolling = returns.slice(window).map((_, i) => {
    const slice = returns.slice(i, i + window);
    const vol = std(slice) * Math.sqrt(252);
    return vol ? (mean(slice) * 252) / vol : 0;
  });
  const min = Math.min(...rolling, -1);
  const max = Math.max(...rolling, 1);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 5) * i);
    ctx.lineTo(w, (h / 5) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 2;
  ctx.beginPath();
  rolling.forEach((value, i) => {
    const x = (i / (rolling.length - 1)) * w;
    const y = 12 + (1 - (value - min) / (max - min || 1)) * (h - 24);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawRollingSeries(canvas, values) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const rolling = (values || []).filter((value) => Number.isFinite(value));
  ctx.clearRect(0, 0, w, h);
  if (!rolling.length) return;
  const min = Math.min(...rolling, -1);
  const max = Math.max(...rolling, 1);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 5) * i);
    ctx.lineTo(w, (h / 5) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 2;
  ctx.beginPath();
  rolling.forEach((value, i) => {
    const x = (i / Math.max(rolling.length - 1, 1)) * w;
    const y = 12 + (1 - (value - min) / (max - min || 1)) * (h - 24);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function openStrategyReview(strategy, artifact) {
  if (!strategy) return;
  activeStrategy = strategy;
  activeArtifact = artifact;
  const returns = strategy.risk_packet?.chart_series?.returns || [];
  const stats = distributionStats(returns);
  const current = artifact.allocation.current_weights[strategy.strategy_id] || strategy.target_weight;
  const proposed = artifact.allocation.proposed_weights[strategy.strategy_id] || current;
  const change = proposed - current;
  document.getElementById("dialogStrategyId").textContent = strategy.strategy_id;
  document.getElementById("dialogStrategyName").textContent = strategy.name;
  document.getElementById("dialogStrategyMeta").textContent = `${strategy.strategy_type} / ${strategy.status} / ${strategy.backtest_status}`;
  document.getElementById("dialogDecisionBadge").textContent = Math.abs(change) < 0.0001 ? "Keep" : change > 0 ? "Increase Review" : "Reduce Review";
  document.getElementById("reviewKpis").innerHTML = [
    ["Ann. Return", pct(stats.annReturn, 2), "neutral"],
    ["Ann. Vol", pct(stats.annVol, 2), "neutral"],
    ["Sharpe", stats.sharpe.toFixed(2), "neutral"],
    ["Sortino", stats.sortino.toFixed(2), "neutral"],
    ["Win Rate", pct(stats.winRate, 1), "neutral"],
    ["Skew", stats.skew.toFixed(2), stats.skew < -0.5 ? "warning-text" : "neutral"],
    ["Kurtosis", stats.kurt.toFixed(2), stats.kurt > 4 ? "warning-text" : "neutral"],
    ["Max DD", pct(stats.maxDrawdown, 2), "negative"],
  ].map(([label, value, klass]) => `<article class="kpi-card"><span>${label}</span><strong class="${klass}">${value}</strong></article>`).join("");
  document.getElementById("tailRiskPanel").innerHTML = [
    ["95% VaR", stats.var95],
    ["99% VaR", stats.var99],
    ["95% Expected Shortfall", stats.es95],
    ["Worst Day", stats.worst],
    ["Best Day", stats.best],
  ].map(([label, value]) => `<div><span>${label}</span><strong class="${value < 0 ? "negative" : "positive"}">${pct(value, 2)}</strong></div>`).join("");
  document.getElementById("factorReviewPanel").innerHTML = ["Equity Beta", "Rates Duration", "Credit/Liquidity", "USD/FX", "Volatility"].map((label, idx) => {
    const exposure = Object.values(strategy.factor_exposure?.latest || {})[idx] || 0;
    return `<div><span>${label}</span><div class="bar"><span style="width:${Math.abs(exposure) * 100}%"></span></div><strong class="${exposure < 0 ? "negative" : "positive"}">${exposure.toFixed(2)}</strong></div>`;
  }).join("");
  document.getElementById("decisionPacket").innerHTML = `
    <p><strong>Allocation:</strong> ${pct(current)} current -> ${pct(proposed)} proposed, ${pct(change, 2)} change.</p>
    <p><strong>Cost estimate:</strong> ${money(Math.abs(change) * artifact.initial_capital * 0.0005)} using 5 bps per side.</p>
    <p><strong>Failure modes:</strong> ${strategy.failure_modes.join("; ")}</p>
    <p><strong>Proxy universe:</strong> ${(strategy.proxy_universe || []).join(", ") || "Pending liquid proxy mapping"}.</p>
    <p><strong>Risk analyst question:</strong> Is recent drawdown normal behavior, regime headwind, factor crowding, cost decay, signal decay, or data failure?</p>
    <p><strong>Data note:</strong> Diagnostics use the validated return series attached to the strategy risk packet.</p>
  `;
  renderEmptyLiteraturePacket();
  renderRiskChecklist(strategy, stats, current, proposed, change);
  drawDistribution(document.getElementById("distributionCanvas"), returns);
  drawReturnAndDrawdown(document.getElementById("detailReturnCanvas"), stats);
  drawRolling(document.getElementById("rollingCanvas"), returns);
  const dialog = document.getElementById("strategyDialog");
  if (!dialog.open) dialog.showModal();
}

function openLiteratureStrategyReview(item, artifact) {
  const backtest = item.backtest;
  const walk = item.walk_forward || {};
  const packet = backtest.risk_packet || {};
  const summary = packet.summary_statistics || {};
  const distribution = packet.distribution_shape || {};
  const tail = packet.tail_risk || {};
  const drawdown = packet.drawdown_behavior || {};
  const benchmark = packet.comparison_vs_benchmark || {};
  const series = packet.chart_series || {};
  const returns = (series.returns || []).filter((value) => Number.isFinite(value));
  const action = backtest.action || {};
  document.getElementById("dialogStrategyId").textContent = backtest.strategy_id;
  document.getElementById("dialogStrategyName").textContent = backtest.name;
  document.getElementById("dialogStrategyMeta").textContent = `${backtest.literature_source} / ${backtest.rebalance} / yfinance ETF proxy`;
  document.getElementById("dialogDecisionBadge").textContent = action.action || "Review";
  document.getElementById("reviewKpis").innerHTML = [
    ["Ann. Return", pct(summary.annual_return || 0, 2), "neutral"],
    ["Ann. Vol", pct(summary.annual_volatility || 0, 2), "neutral"],
    ["Sharpe", num(summary.sharpe), "neutral"],
    ["Sortino", num(summary.sortino), "neutral"],
    ["Calmar", num(summary.calmar), "neutral"],
    ["Win Rate", pct(summary.win_rate || 0, 1), "neutral"],
    ["Skew", num(distribution.skewness), distribution.skewness < -0.5 ? "warning-text" : "neutral"],
    ["Max DD", pct(drawdown.max_drawdown || 0, 2), "negative"],
  ].map(([label, value, klass]) => `<article class="kpi-card"><span>${label}</span><strong class="${klass}">${value}</strong></article>`).join("");
  document.getElementById("tailRiskPanel").innerHTML = [
    ["95% VaR", tail.var_95],
    ["99% VaR", tail.var_99],
    ["95% ES", tail.expected_shortfall_95],
    ["99% ES", tail.expected_shortfall_99],
    ["Worst Day", summary.worst_day],
    ["Best Day", summary.best_day],
  ].map(([label, value]) => `<div><span>${label}</span><strong class="${value < 0 ? "negative" : "positive"}">${pct(value || 0, 2)}</strong></div>`).join("");
  document.getElementById("factorReviewPanel").innerHTML = [
    ["SPY Beta", benchmark.beta || 0],
    ["SPY Corr", benchmark.correlation || 0],
    ["Alpha Ann.", benchmark.alpha_annualized || 0],
    ["Tracking Error", benchmark.tracking_error || 0],
    ["Info Ratio", benchmark.information_ratio || 0],
  ].map(([label, value]) => `
    <div>
      <span>${label}</span>
      <div class="bar"><span style="width:${Math.min(100, Math.abs(value) * 80)}%"></span></div>
      <strong class="${value < 0 ? "negative" : "positive"}">${label.includes("Ann") || label.includes("Error") ? pct(value, 2) : num(value)}</strong>
    </div>
  `).join("");
  document.getElementById("decisionPacket").innerHTML = `
    <p><strong>Hypothesis:</strong> ${backtest.hypothesis}</p>
    <p><strong>Signal:</strong> ${backtest.signal_summary}</p>
    <p><strong>Universe:</strong> ${backtest.universe.join(", ")}</p>
    <p><strong>Action:</strong> ${action.action || "Review"} / ${action.reason_code || "pending"}.</p>
    <p><strong>Interpretation:</strong> ${action.interpretation || ""}</p>
    <p><strong>WFO:</strong> ${walk.status || "pending"}, average test Sharpe ${num(walk.average_test_sharpe)}, positive windows ${pct(walk.positive_window_rate || 0, 0)}.</p>
  `;
  renderLiteratureMetricPacket(packet, backtest, walk);
  renderLiteratureChecklist(backtest, packet, walk);
  drawDistribution(document.getElementById("distributionCanvas"), returns);
  drawSeriesReturnAndDrawdown(document.getElementById("detailReturnCanvas"), series);
  drawRollingSeries(document.getElementById("rollingCanvas"), series.rolling_63d_sharpe || []);
  const dialog = document.getElementById("strategyDialog");
  if (!dialog.open) dialog.showModal();
}

function renderEmptyLiteraturePacket() {
  ["literatureDetailSummary", "literatureRegimeBreakdown", "literatureBenchmarkComparison", "literatureWorstDays"].forEach((id) => {
    document.getElementById(id).innerHTML = "<tr><td>Open a literature prototype to view real yfinance-backed diagnostics.</td></tr>";
  });
}

function renderRiskChecklist(strategy, stats, current, proposed, change) {
  const checklist = [
    {
      title: "1. Summary Statistics",
      status: "Calculated",
      items: [
        `Annual return ${pct(stats.annReturn, 2)}, annual volatility ${pct(stats.annVol, 2)}, Sharpe ${stats.sharpe.toFixed(2)}.`,
        `Sortino ${stats.sortino.toFixed(2)}, win rate ${pct(stats.winRate, 1)}, best day ${pct(stats.best, 2)}, worst day ${pct(stats.worst, 2)}.`,
        `Skew ${stats.skew.toFixed(2)} and kurtosis ${stats.kurt.toFixed(2)} flag whether returns hide left-tail or fat-tail risk.`,
      ],
      prompt: "Is performance broad-based, or does it depend on a few extreme positive days?",
    },
    {
      title: "2. Distribution Shape",
      status: "Charted",
      items: [
        "Review histogram, density shape, QQ plot when available, and outlier summary.",
        "Look for long left tail, clustered near-zero returns, and unusual outlier bars.",
        "Treat non-normal shape as a warning that simple volatility may understate risk.",
      ],
      prompt: "Does the distribution look like steady compensation or hidden crash exposure?",
    },
    {
      title: "3. Tail Risk",
      status: "Calculated",
      items: [
        `95% VaR ${pct(stats.var95, 2)}, 99% VaR ${pct(stats.var99, 2)}, 95% Expected Shortfall ${pct(stats.es95, 2)}.`,
        "Review worst 5 and worst 10 periods once real return history is connected.",
        "Compare tail loss with portfolio stress days to see whether the strategy fails when protection is needed.",
      ],
      prompt: "If the strategy enters its worst 5% outcomes, is the loss acceptable for its allocation?",
    },
    {
      title: "4. Drawdown Behavior",
      status: "Charted",
      items: [
        `Max drawdown ${pct(stats.maxDrawdown, 2)} and current drawdown ${pct(stats.currentDrawdown, 2)}.`,
        "Use cumulative return and underwater curves to see whether losses are sudden or slow.",
        "Add drawdown duration, recovery time, and number of drawdown episodes when real history is connected.",
      ],
      prompt: "Is the current drawdown normal, regime-driven, or evidence of strategy decay?",
    },
    {
      title: "5. Time Stability",
      status: "Partial",
      items: [
        "Review rolling Sharpe, rolling volatility, rolling drawdown, rolling win rate, and rolling correlation.",
        "Compare recent behavior with full-history behavior and walk-forward expectations.",
        "Watch for rising volatility, falling hit rate, or correlation increasing during stress.",
      ],
      prompt: "Is performance persistent, or did the strategy work only in one historical window?",
    },
    {
      title: "6. Regime Breakdown",
      status: "Pending real regime labels",
      items: [
        "Split returns by VIX high/low, equity up/down, rates up/down, credit widening/tightening, USD up/down, and risk-on/risk-off.",
        "For each regime, compare mean return, volatility, Sharpe, max drawdown, hit rate, and tail loss.",
        "Use regime results to decide whether a current loss is expected behavior or a warning sign.",
      ],
      prompt: "Is today's market regime favorable, unfavorable, or dangerous for this strategy?",
    },
    {
      title: "7. Comparison Vs Benchmark / Strategies",
      status: "Pending full strategy matrix",
      items: [
        "Compare beta, alpha, tracking error, information ratio, and correlation to benchmark.",
        "Compare correlation and factor overlap with active strategies.",
        "Estimate marginal risk contribution and diversification benefit before increasing allocation.",
      ],
      prompt: "Is this independent alpha, useful diversification, or duplicated exposure?",
    },
    {
      title: "Decision",
      status: "Human review required",
      items: [
        `Current allocation ${pct(current)}, proposed allocation ${pct(proposed)}, change ${pct(change, 2)}.`,
        `Failure modes: ${strategy.failure_modes.join("; ")}.`,
        "Decision choices: keep, increase review, reduce, hedge, pause, retire, or reject.",
      ],
      prompt: "What decision can be defended from the evidence, and what limitation should be disclosed?",
    },
  ];

  document.getElementById("riskChecklist").innerHTML = checklist.map((section) => `
    <section class="check-section">
      <header>
        <h3>${section.title}</h3>
        <span class="badge ${section.status.includes("Pending") ? "warning" : section.status.includes("Partial") ? "warning" : "ok"}">${section.status}</span>
      </header>
      <ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul>
      <p><strong>Analyst prompt:</strong> ${section.prompt}</p>
    </section>
  `).join("");
}

function renderLiteratureMetricPacket(packet, backtest, walk) {
  const summary = packet.summary_statistics || {};
  const distribution = packet.distribution_shape || {};
  const tail = packet.tail_risk || {};
  const drawdown = packet.drawdown_behavior || {};
  const stability = packet.time_stability || {};
  const benchmark = packet.comparison_vs_benchmark || {};
  document.getElementById("literatureDetailSummary").innerHTML = "<tr><th>Category</th><th>Metric</th><th>Value</th><th>Risk Manager Read</th></tr>" + [
    ["Summary", "Cumulative Return", pct(summary.cumulative_return || 0, 2), "Total net growth after costs."],
    ["Summary", "Annual Return / Vol", `${pct(summary.annual_return || 0, 2)} / ${pct(summary.annual_volatility || 0, 2)}`, "Return must be judged against volatility."],
    ["Summary", "Sharpe / Sortino / Calmar", `${num(summary.sharpe)} / ${num(summary.sortino)} / ${num(summary.calmar)}`, "Risk-adjusted return, downside-adjusted return, drawdown-adjusted return."],
    ["Summary", "Win Rate / Payoff", `${pct(summary.win_rate || 0, 1)} / ${num(summary.payoff_ratio)}`, "High win rate is not enough if losses are much larger."],
    ["Distribution", "Skew / Excess Kurtosis", `${num(distribution.skewness)} / ${num(distribution.excess_kurtosis)}`, "Negative skew and fat tails are hidden risk."],
    ["Distribution", "P01 / P05 / P95 / P99", `${pct(distribution.p01 || 0, 2)} / ${pct(distribution.p05 || 0, 2)} / ${pct(distribution.p95 || 0, 2)} / ${pct(distribution.p99 || 0, 2)}`, "Shows the left and right edges of the return distribution."],
    ["Tail", "VaR 95 / VaR 99", `${pct(tail.var_95 || 0, 2)} / ${pct(tail.var_99 || 0, 2)}`, "Loss threshold in bad days."],
    ["Tail", "ES 95 / ES 99", `${pct(tail.expected_shortfall_95 || 0, 2)} / ${pct(tail.expected_shortfall_99 || 0, 2)}`, "Average loss after VaR is breached."],
    ["Drawdown", "Max / Current DD", `${pct(drawdown.max_drawdown || 0, 2)} / ${pct(drawdown.current_drawdown || 0, 2)}`, "Whether loss is historic breach or current pain."],
    ["Drawdown", "Max Duration / Episodes", `${drawdown.max_drawdown_duration_days || 0} days / ${drawdown.drawdown_episode_count || 0}`, "How long capital can stay underwater."],
    ["Stability", "63D Rolling Sharpe Latest / Avg / Min", `${num(stability["63d"]?.latest_rolling_sharpe)} / ${num(stability["63d"]?.average_rolling_sharpe)} / ${num(stability["63d"]?.min_rolling_sharpe)}`, "Detects recent strategy decay."],
    ["Stability", "252D Positive Sharpe Rate", pct(stability["252d"]?.positive_sharpe_rate || 0, 0), "How often longer windows were actually useful."],
    ["Benchmark", "Beta / Corr To SPY", `${num(benchmark.beta)} / ${num(benchmark.correlation)}`, "Tells whether this is alpha or disguised equity exposure."],
    ["Benchmark", "Alpha / IR", `${pct(benchmark.alpha_annualized || 0, 2)} / ${num(benchmark.information_ratio)}`, "Active performance versus benchmark."],
  ].map(([category, metric, value, read]) => `<tr><td>${category}</td><td>${metric}</td><td>${value}</td><td>${read}</td></tr>`).join("");

  const regimes = packet.regime_breakdown || {};
  document.getElementById("literatureRegimeBreakdown").innerHTML = "<tr><th>Regime</th><th>Obs.</th><th>Ann. Ret</th><th>Vol</th><th>Sharpe</th><th>Max DD</th><th>Win</th><th>ES 95</th></tr>" +
    Object.entries(regimes).map(([name, value]) => `<tr>
      <td>${name.replaceAll("_", " ")}</td>
      <td>${value.observations || 0}</td>
      <td class="${cls(value.annual_return || 0)}">${pct(value.annual_return || 0, 2)}</td>
      <td>${pct(value.annual_volatility || 0, 2)}</td>
      <td>${num(value.sharpe)}</td>
      <td class="negative">${pct(value.max_drawdown || 0, 2)}</td>
      <td>${pct(value.win_rate || 0, 0)}</td>
      <td class="negative">${pct(value.expected_shortfall_95 || 0, 2)}</td>
    </tr>`).join("");

  document.getElementById("literatureBenchmarkComparison").innerHTML = "<tr><th>Benchmark</th><th>Beta</th><th>Corr</th><th>Alpha Ann.</th><th>Tracking Error</th><th>Info Ratio</th><th>Up Capture</th><th>Down Capture</th></tr>" +
    `<tr><td>${benchmark.benchmark || "SPY"}</td><td>${num(benchmark.beta)}</td><td>${num(benchmark.correlation)}</td><td class="${cls(benchmark.alpha_annualized || 0)}">${pct(benchmark.alpha_annualized || 0, 2)}</td><td>${pct(benchmark.tracking_error || 0, 2)}</td><td>${num(benchmark.information_ratio)}</td><td>${num(benchmark.up_capture)}</td><td>${num(benchmark.down_capture)}</td></tr>`;

  document.getElementById("literatureWorstDays").innerHTML = "<tr><th>Date</th><th>Return</th><th>Interpretation</th></tr>" +
    (tail.worst_10_days || []).map((day) => `<tr><td>${day.date}</td><td class="negative">${pct(day.return || 0, 2)}</td><td>Review market regime, factor shock, and whether loss was expected by the strategy design.</td></tr>`).join("");
}

function renderLiteratureChecklist(backtest, packet, walk) {
  const summary = packet.summary_statistics || {};
  const distribution = packet.distribution_shape || {};
  const tail = packet.tail_risk || {};
  const drawdown = packet.drawdown_behavior || {};
  const benchmark = packet.comparison_vs_benchmark || {};
  const checklist = [
    {
      title: "1. Summary Statistics",
      status: "Calculated",
      items: [
        `Annual return ${pct(summary.annual_return || 0, 2)}, annual volatility ${pct(summary.annual_volatility || 0, 2)}, Sharpe ${num(summary.sharpe)}.`,
        `Sortino ${num(summary.sortino)}, Calmar ${num(summary.calmar)}, profit factor ${num(summary.profit_factor)}.`,
        `Annualized turnover ${pct(summary.annualized_turnover || 0, 1)}, so cost drag must be checked before allocation.`,
      ],
      prompt: "Is the return high enough for the volatility, drawdown, and turnover it consumes?",
    },
    {
      title: "2. Distribution Shape",
      status: "Calculated",
      items: [
        `Skewness ${num(distribution.skewness)}, excess kurtosis ${num(distribution.excess_kurtosis)}.`,
        `P01 ${pct(distribution.p01 || 0, 2)}, P05 ${pct(distribution.p05 || 0, 2)}, P95 ${pct(distribution.p95 || 0, 2)}, P99 ${pct(distribution.p99 || 0, 2)}.`,
        "Negative skew means the strategy may look calm most days but lose heavily in stress.",
      ],
      prompt: "Is this a smooth alpha distribution, or a strategy selling hidden tail risk?",
    },
    {
      title: "3. Tail Risk",
      status: "Calculated",
      items: [
        `VaR 95 ${pct(tail.var_95 || 0, 2)}, VaR 99 ${pct(tail.var_99 || 0, 2)}.`,
        `ES 95 ${pct(tail.expected_shortfall_95 || 0, 2)}, ES 99 ${pct(tail.expected_shortfall_99 || 0, 2)}.`,
        `${tail.left_tail_2sigma_count || 0} days breached the 2-sigma left-tail threshold.`,
      ],
      prompt: "Can the portfolio survive this strategy's bad tail at the proposed allocation?",
    },
    {
      title: "4. Drawdown Behavior",
      status: "Calculated",
      items: [
        `Max drawdown ${pct(drawdown.max_drawdown || 0, 2)} on ${drawdown.max_drawdown_date || "n/a"}.`,
        `Current drawdown ${pct(drawdown.current_drawdown || 0, 2)}, max duration ${drawdown.max_drawdown_duration_days || 0} trading days.`,
        `${drawdown.drawdown_episode_count || 0} drawdown episodes across the sample.`,
      ],
      prompt: "Is current pain within normal drawdown behavior, or already a breach?",
    },
    {
      title: "5. Time Stability",
      status: "Calculated",
      items: [
        `Walk-forward status ${walk.status || "pending"}, average test Sharpe ${num(walk.average_test_sharpe)}.`,
        `Positive test windows ${pct(walk.positive_window_rate || 0, 0)}.`,
        "Rolling 21D, 63D, 126D, and 252D Sharpe/vol/drawdown are stored in the metric packet.",
      ],
      prompt: "Did this work repeatedly through time, or only in one historical segment?",
    },
    {
      title: "6. Regime Breakdown",
      status: "Calculated",
      items: [
        "Returns are split by equity up/down, realized volatility high/low, credit stress/supportive, rates up/down, and USD up/down.",
        "This tells us whether losses are expected regime headwind or abnormal strategy decay.",
        "A strategy can be kept during explainable headwind, but reduced if it fails in regimes where it is supposed to help.",
      ],
      prompt: "Which regime does this strategy actually want, and are we currently in the wrong one?",
    },
    {
      title: "7. Comparison Vs Benchmark / Strategies",
      status: "Calculated",
      items: [
        `SPY beta ${num(benchmark.beta)}, correlation ${num(benchmark.correlation)}.`,
        `Annualized alpha ${pct(benchmark.alpha_annualized || 0, 2)}, information ratio ${num(benchmark.information_ratio)}.`,
        "Next layer is comparing this strategy to all other active strategies for duplicate exposure.",
      ],
      prompt: "Is it independent alpha, useful diversification, or another form of equity beta?",
    },
    {
      title: "Decision",
      status: "Human review required",
      items: [
        `System action: ${backtest.action?.action || "Review"} because ${backtest.action?.reason_code || "pending"}.`,
        `Failure modes: ${backtest.failure_modes.join("; ")}.`,
        "Decision choices remain keep, increase review, reduce, hedge, pause, retire, or reject.",
      ],
      prompt: "What action can we defend to the boss from evidence, not from hope?",
    },
  ];
  document.getElementById("riskChecklist").innerHTML = checklist.map((section) => `
    <section class="check-section">
      <header>
        <h3>${section.title}</h3>
        <span class="badge ${section.status.includes("Pending") ? "warning" : "ok"}">${section.status}</span>
      </header>
      <ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul>
      <p><strong>Analyst prompt:</strong> ${section.prompt}</p>
    </section>
  `).join("");
}

function renderCandidateStrategies() {
  document.getElementById("candidateStrategyTable").innerHTML = "<tr><th>Candidate</th><th>Paper Source</th><th>ETF Coverage</th><th>Signal</th><th>Main Risk</th><th>Status</th></tr>" +
    strategyCandidateShelf.map(([name, source, universe, signal, risk, status]) => {
      const badge = status.includes("running") ? "ok" : status.includes("Next") ? "warning" : "";
      return `<tr>
        <td><strong>${name}</strong></td>
        <td>${source}</td>
        <td>${universe}</td>
        <td>${signal}</td>
        <td>${risk}</td>
        <td><span class="badge ${badge || "warning"}">${status}</span></td>
      </tr>`;
    }).join("");
}

function renderLiteratureStrategies(snapshot) {
  const results = snapshot.results || [];
  if (!results.length) {
    document.getElementById("literatureStrategyTable").innerHTML = "<tr><td>No literature strategy backtest yet. Run refresh_platform.py.</td></tr>";
    return;
  }
  document.getElementById("literatureStrategyTable").innerHTML = "<tr><th>Prototype</th><th>Source</th><th>Net Sharpe</th><th>Ann. Return</th><th>Max DD</th><th>Cost Drag</th><th>WFO</th><th>Avg Test Sharpe</th><th>Positive Windows</th><th>Action</th><th>Reason</th></tr>" +
    results.map((item, idx) => {
      const backtest = item.backtest;
      const walk = item.walk_forward || {};
      const net = backtest.net_metrics || {};
      const turnover = backtest.turnover || {};
      const action = backtest.action || {};
      const isPause = action.action === "Pause" || action.action === "Reduce";
      const isReview = action.action === "Increase Review";
      const badge = isPause ? "breach" : isReview ? "ok" : "warning";
      return `<tr data-literature-strategy="${idx}">
        <td>${backtest.name}</td>
        <td>${backtest.literature_source}</td>
        <td>${(net.sharpe || 0).toFixed(2)}</td>
        <td class="${cls(net.annual_return || 0)}">${pct(net.annual_return || 0, 2)}</td>
        <td class="negative">${pct(net.max_drawdown || 0, 2)}</td>
        <td>${pct(turnover.annualized_cost_drag || 0, 2)}</td>
        <td>${walk.status || "pending"}</td>
        <td>${(walk.average_test_sharpe || 0).toFixed(2)}</td>
        <td>${pct(walk.positive_window_rate || 0, 0)}</td>
        <td><span class="badge ${badge}">${action.action || "Review"}</span></td>
        <td>${action.reason_code || "pending"}</td>
      </tr>`;
    }).join("");
  document.querySelectorAll("[data-literature-strategy]").forEach((row) => {
    row.addEventListener("click", () => {
      const item = results[Number(row.dataset.literatureStrategy)];
      item._index = Number(row.dataset.literatureStrategy);
      renderResearchLabPanels(item);
      setActiveTab("Backtesting & Research Lab");
      openLiteratureStrategyReview(item, activeArtifact || fallbackArtifact);
    });
  });
  if (results.length) {
    const first = { ...results[0], _index: 0 };
    renderResearchLabPanels(first);
  }
}

function renderReplicationClone(snapshot) {
  const results = snapshot.results || [];
  const rolling = results.find((item) => item.method && item.method.startsWith("rolling")) || results[0];
  if (!rolling) {
    document.getElementById("replicationSummaryTable").innerHTML = "<tr><td>No replication snapshot yet. Run refresh_platform.py.</td></tr>";
    document.getElementById("replicationBetas").innerHTML = "";
    return;
  }
  document.getElementById("replicationSummaryTable").innerHTML = `
    <tr><th>Target</th><th>Method</th><th>Obs.</th><th>R2</th><th>Alpha Ann.</th><th>Target Sharpe</th><th>Clone Sharpe</th><th>Interpretation</th></tr>
    <tr>
      <td>${rolling.target_name}</td>
      <td>${rolling.method}</td>
      <td>${rolling.observations}</td>
      <td>${rolling.r_squared.toFixed(3)}</td>
      <td class="${cls(rolling.alpha_annualized)}">${pct(rolling.alpha_annualized, 2)}</td>
      <td>${rolling.target_metrics.sharpe.toFixed(2)}</td>
      <td>${rolling.clone_metrics.sharpe.toFixed(2)}</td>
      <td>${rolling.r_squared > 0.7 ? "Mostly common factor beta" : "Large residual / missing factors"}</td>
    </tr>
  `;
  const betas = rolling.betas || {};
  const maxAbs = Math.max(...Object.values(betas).map((value) => Math.abs(value)), 0.01);
  document.getElementById("replicationBetas").innerHTML = Object.entries(betas).map(([factor, beta]) => `
    <div>
      <span>${factor}</span>
      <div class="bar"><span style="width:${Math.min(100, Math.abs(beta) / maxAbs * 100)}%"></span></div>
      <strong class="${beta < 0 ? "negative" : "positive"}">${beta.toFixed(2)}</strong>
    </div>
  `).join("") + `<p>${(rolling.warnings || []).join(" ")}</p>`;
}

function statusBadge(status) {
  const normalized = String(status || "watch").toLowerCase();
  const badge = normalized === "ok" || normalized.includes("pass") || normalized.includes("keep") || normalized.includes("within") || normalized === "eligible"
    ? "ok"
    : normalized === "breach" || normalized.includes("reject") || normalized.includes("pause") || normalized.includes("block")
      ? "breach"
      : "warning";
  return `<span class="badge ${badge}">${String(status || "watch").replaceAll("_", " ")}</span>`;
}

function setBadgeElement(element, status) {
  const normalized = String(status || "watch").toLowerCase();
  const badge = normalized === "ok" || normalized.includes("pass") || normalized.includes("keep")
    ? "ok"
    : normalized === "breach" || normalized.includes("reject") || normalized.includes("pause") || normalized.includes("block")
      ? "breach"
      : "warning";
  element.className = `badge ${badge}`;
  element.textContent = String(status || "watch").replaceAll("_", " ");
}

function positionSummary(strategy) {
  const positions = strategy.position_packet?.latest_positions || [];
  if (!positions.length) return "No active position";
  return positions.slice(0, 3).map((position) => `${position.ticker} ${pct(position.weight, 0)}`).join(" / ");
}

function renderKpis(artifact) {
  const series = portfolioSeriesForDisplay(artifact);
  const start = investmentStart(artifact);
  const portfolioReturns = series.returns || [];
  const cumulative = series.cumulative_return || [];
  const dailyPnlMetric = operatingPnlMetric(artifact, "daily_return");
  const cumPnlMetric = operatingPnlMetric(artifact, "cumulative_return");
  const latestReturn = metricNumeric(dailyPnlMetric) ?? portfolioReturns.at(-1) ?? 0;
  const latestCum = metricNumeric(cumPnlMetric) ?? cumulative.at(-1) ?? 0;
  const aumNow = artifact.initial_capital * (1 + latestCum);
  const sparkCum = cumulative.slice(-Math.min(48, cumulative.length));
  const headline = canonicalRiskHeadline(artifact);
  const kpis = [
    ["AUM", money(aumNow), cls(latestCum), "portfolio", sparkCum.length ? sparkCum : [0, latestCum]],
    ["Daily PnL", money(latestReturn * artifact.initial_capital), cls(latestReturn), "dollar", portfolioReturns.slice(-Math.min(24, portfolioReturns.length))],
    ["Cumulative PnL", money(latestCum * artifact.initial_capital), cls(latestCum), "line", sparkCum.length ? sparkCum : [0, latestCum]],
    ["Sharpe", formatOperatingMetric(operatingMetric(artifact, "portfolio_sharpe")), "neutral", "target", sparkCum.length ? sparkCum : portfolioReturns.slice(-24)],
    ["Volatility", formatOperatingMetric(operatingMetric(artifact, "portfolio_volatility"), { asPct: true }), "neutral", "activity", portfolioReturns.map(Math.abs).slice(-24)],
    ["Max Drawdown", formatOperatingMetric(operatingMetric(artifact, "portfolio_max_drawdown"), { asPct: true }), "negative", "risk", series.drawdown?.slice(-Math.min(48, series.drawdown?.length || 0)) || []],
    ["1D 99% VaR", formatOperatingMetric(operatingMetric(artifact, "portfolio_var_99"), { asPct: true }), "warning-text", "shield", portfolioReturns.slice(-24)],
    ["Expected Shortfall", formatOperatingMetric(operatingMetric(artifact, "portfolio_expected_shortfall_95"), { asPct: true }), "warning-text", "risk", portfolioReturns.slice(-24)],
    ["Risk Status", `${headline.blocking_breaches || 0} breach / ${headline.warnings || 0} warn`, headline.blocking_breaches ? "negative" : "warning-text", "risk", portfolioReturns.slice(-24)],
  ];
  document.getElementById("portfolioKpis").innerHTML = kpis.map((item, idx) => `
    <article class="kpi-card">
      <span>${icon(item[3])}${item[0]}</span>
      <strong class="${item[2]}">${item[1]}</strong>
      <small>${idx < 3 ? `Operating period since ${start}` : idx === kpis.length - 1 ? "Canonical scoped model limits" : `Operating period · min obs not met if N/A`}</small>
      <canvas width="120" height="28" data-spark="${idx}"></canvas>
    </article>`).join("");
  document.querySelectorAll("[data-spark]").forEach((canvas, idx) => {
    canvas.__sparkValues = kpis[idx][4];
    canvas.__sparkColor = idx >= 5 ? "#ff5a4f" : "#1ac8ff";
    drawSparkline(canvas, canvas.__sparkValues, canvas.__sparkColor);
  });
  renderCompareAllocationKpis(artifact);
}

function renderTables(artifact) {
  const strategies = artifact.strategies || [];
  document.getElementById("allocationTable").innerHTML = `<tr><th>Strategy</th><th>Alloc.</th></tr>` +
    strategies.filter((s) => s.current_weight > 0).map((s) => `<tr><td><button class="table-link" data-open-strategy="${s.strategy_id}">${s.name}</button></td><td>${pct(s.current_weight || 0)}</td></tr>`).join("");

  const performanceHeader = "<tr><th>#</th><th>Strategy</th><th>Type</th><th>Status</th><th>Current</th><th>Proposed</th><th>Daily PnL</th><th>Daily Ret</th><th>Op. Sharpe</th><th>Historical Sharpe</th><th>Vol</th><th>Current DD</th><th>Model Risk</th><th>Action</th></tr>";
  const performanceRows = strategies.map((s, idx) => {
    const live = s.current_weight > 0;
    const opSharpe = s.since_investment?.sharpe;
    const opSharpeText = opSharpe?.available === false || opSharpe?.value == null
      ? `N/A (${opSharpe?.observations || 0}/${opSharpe?.minimum_observations || "?"} obs)`
      : num(typeof opSharpe === "object" ? opSharpe.value : opSharpe);
    return `<tr class="${live ? "" : "research-only-row"}" data-strategy="${s.strategy_id}">
    <td>${idx + 1}</td><td><button class="table-link" data-open-strategy="${s.strategy_id}"><strong>${s.name}</strong></button><small>${positionSummary(s)}</small></td><td>${s.strategy_type}</td>
    <td>${live ? statusBadge("model allocated") : statusBadge("research only")}</td>
    <td>${pct(s.current_weight || 0)}</td><td>${pct(s.proposed_weight || 0)}</td>
    <td class="${cls(s.daily_pnl || 0)}">${money(s.daily_pnl || 0)}</td>
    <td class="${cls(s.daily_return || 0)}">${pct(s.daily_return || 0, 2)}</td>
    <td>${live ? opSharpeText : "—"}</td>
    <td>${num(s.sharpe)}</td><td>${pct(s.volatility || 0, 1)}</td>
    <td class="negative">${pct(s.current_drawdown || s.max_drawdown || 0, 1)}</td>
    <td>${statusBadge(live ? (s.live_risk_status || s.risk_status) : "not applicable")}</td><td>${statusBadge(s.final_action_after_double_check || s.recommended_action)}</td>
  </tr>`;
  }).join("");
  document.getElementById("strategyTable").innerHTML = performanceHeader + performanceRows;
  document.querySelectorAll("#strategyTable [data-open-strategy]").forEach((button) => button.addEventListener("click", () => {
    const strategy = artifact.strategies.find((row) => row.strategy_id === button.dataset.openStrategy);
    renderDrawer(strategy, artifact);
    setActiveTab("Strategy Monitor");
  }));

  const monitorSortValue = (strategy, key) => {
    if (key === "name") return strategy.name || "";
    if (key === "turnover") return strategy.turnover?.annualized_turnover || 0;
    return strategy[key] ?? 0;
  };
  const sortedStrategies = [...strategies].sort((left, right) => {
    const a = monitorSortValue(left, monitorSort.key);
    const b = monitorSortValue(right, monitorSort.key);
    if (typeof a === "string" || typeof b === "string") {
      return monitorSort.direction === "asc"
        ? String(a).localeCompare(String(b))
        : String(b).localeCompare(String(a));
    }
    return monitorSort.direction === "asc" ? a - b : b - a;
  });
  const sortableHeader = (label, key) => {
    const active = monitorSort.key === key ? ` sorted-${monitorSort.direction}` : "";
    return `<th><button type="button" class="table-sort${active}" data-sort-key="${key}">${label}</button></th>`;
  };
  const monitorHeader = `<tr>${sortableHeader("Strategy", "name")}<th>Eligibility</th>${sortableHeader("Cur.", "current_weight")}${sortableHeader("Prop.", "proposed_weight")}<th>Position</th>${sortableHeader("Daily PnL", "daily_pnl")}${sortableHeader("MTD", "mtd_pnl")}${sortableHeader("YTD", "ytd_pnl")}${sortableHeader("Sharpe", "sharpe")}${sortableHeader("Roll", "rolling_sharpe")}${sortableHeader("Vol", "volatility")}${sortableHeader("Current DD", "current_drawdown")}${sortableHeader("Turnover", "turnover")}<th>Signal</th><th>Model Risk</th><th>Research Quality</th><th>Final Review</th></tr>`;
  document.getElementById("monitorTable").innerHTML = monitorHeader + sortedStrategies.map((s) => `<tr data-strategy="${s.strategy_id}" data-risk="${s.current_weight > 0 ? (s.live_risk_status || s.risk_status) : "not-applicable"}" data-allocated="${s.current_weight > 0 ? "active" : "research"}" data-search="${`${s.name} ${s.strategy_type} ${positionSummary(s)}`.toLowerCase()}">
    <td><strong>${s.name}</strong><small>${s.strategy_type}</small></td><td>${statusBadge(s.allocation_eligibility?.label || s.allocation_eligibility?.status)}</td><td>${pct(s.current_weight || 0)}</td><td>${pct(s.proposed_weight || 0)}</td>
    <td>${positionSummary(s)}</td><td class="${cls(s.daily_pnl || 0)}">${money(s.daily_pnl || 0)}</td><td class="${cls(s.mtd_pnl || 0)}">${money(s.mtd_pnl || 0)}</td>
    <td class="${cls(s.ytd_pnl || 0)}">${money(s.ytd_pnl || 0)}</td><td>${num(s.sharpe)}</td><td>${num(s.rolling_sharpe)}</td><td>${pct(s.volatility || 0, 1)}</td>
    <td class="negative">${pct(s.current_drawdown || 0, 1)}</td><td>${num(s.turnover?.annualized_turnover, 1)}x</td><td>${s.signal_status}</td>
    <td>${statusBadge(s.current_weight > 0 ? (s.live_risk_status || s.risk_status) : "not applicable")}</td><td>${statusBadge(s.research_quality_status || s.research_status)}</td><td>${statusBadge(s.final_action_after_double_check)}</td>
  </tr>`).join("");
  document.querySelectorAll("#monitorTable [data-sort-key]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    if (monitorSort.key === key) monitorSort.direction = monitorSort.direction === "asc" ? "desc" : "asc";
    else {
      monitorSort.key = key;
      monitorSort.direction = key === "name" ? "asc" : "desc";
    }
    renderTables(artifact);
    installStrategyMonitorControls(artifact);
  }));

  document.querySelectorAll("[data-strategy]").forEach((row) => row.addEventListener("click", () => {
    const selected = strategies.find((item) => item.strategy_id === row.dataset.strategy);
    document.querySelectorAll("#monitorTable tr[data-strategy]").forEach((item) => item.classList.toggle("selected", item === row));
    renderDrawer(selected, artifact);
  }));
  document.querySelectorAll("[data-open-strategy]").forEach((row) => row.addEventListener("click", () => {
    const selected = strategies.find((item) => item.strategy_id === row.dataset.openStrategy);
    setActiveTab("Strategy Monitor");
    renderDrawer(selected, artifact);
    document.querySelectorAll("#monitorTable tr[data-strategy]").forEach((item) => item.classList.toggle("selected", item.dataset.strategy === selected.strategy_id));
  }));

  initializeSimulation(artifact);
}

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function normalizeSimulationPayload(payload) {
  const before = payload.metrics_before || payload.metrics?.before || {};
  const after = payload.metrics_after || payload.metrics || {};
  return {
    source: payload.source || "python_rebalance_simulation",
    metrics: {
      sharpe: after.portfolio_sharpe ?? after.sharpe ?? 0,
      volatility: after.portfolio_volatility ?? after.volatility ?? 0,
      var99: after.portfolio_var_99 ?? after.var99 ?? 0,
      es95: after.portfolio_expected_shortfall_95 ?? after.es95 ?? 0,
      maxDrawdown: after.portfolio_max_drawdown ?? after.maxDrawdown ?? 0,
    },
    metricsBefore: {
      sharpe: before.portfolio_sharpe ?? before.sharpe ?? 0,
      volatility: before.portfolio_volatility ?? before.volatility ?? 0,
      var99: before.portfolio_var_99 ?? before.var99 ?? 0,
      es95: before.portfolio_expected_shortfall_95 ?? before.es95 ?? 0,
      maxDrawdown: before.portfolio_max_drawdown ?? before.maxDrawdown ?? 0,
    },
    checks: payload.checks || [],
    turnover: payload.turnover || 0,
    estimatedCost: payload.estimated_transaction_cost ?? payload.estimatedCost ?? 0,
    limitations: payload.limitations || [],
    factorExposureBefore: payload.factor_exposure_before || {},
    factorExposureAfter: payload.factor_exposure_after || {},
    factorChange: payload.factor_change || {},
    cashWeight: payload.cash_weight,
    proposalGates: payload.proposal_gates || [],
    optimizerLabel: payload.optimizer_label,
    timestamp: payload.timestamp || new Date().toISOString(),
  };
}

async function ensureSimulationApi(artifact, targetWeights) {
  if (officialSimulationFromArtifact(artifact, targetWeights)) return false;
  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_weights: Object.fromEntries((artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.current_weight || 0])),
        target_weights: targetWeights,
        capital: artifact.initial_capital,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchBackendSimulation(artifact, targetWeights) {
  const currentWeights = Object.fromEntries((artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.current_weight || 0]));
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_weights: currentWeights,
      target_weights: targetWeights,
      capital: artifact.initial_capital,
    }),
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `simulation api failed: ${response.status}`);
  }
  return normalizeSimulationPayload(body);
}

function officialSimulationFromArtifact(artifact, targetWeights) {
  const currentWeights = Object.fromEntries((artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.current_weight || 0]));
  const proposedWeights = Object.fromEntries((artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.proposed_weight || 0]));
  const sameAsCurrent = Object.keys(targetWeights).every((key) => Math.abs((targetWeights[key] || 0) - (currentWeights[key] || 0)) < 1e-8);
  const sameAsProposed = Object.keys(targetWeights).every((key) => Math.abs((targetWeights[key] || 0) - (proposedWeights[key] || 0)) < 1e-8);
  const context = artifact.rebalance_simulation || {};
  const payload = sameAsProposed
    ? context.official_optimizer
    : sameAsCurrent
      ? context.current_baseline
      : null;
  if (!payload) return null;
  return normalizeSimulationPayload(payload);
}

function updateWeightTotalsOnly() {
  const total = Object.values(simulatedWeights).reduce((sum, value) => sum + Number(value || 0), 0);
  const cash = 1 - total;
  const totalState = document.getElementById("weightTotalState");
  if (!totalState) return;
  totalState.className = total > 1.00001 ? "negative" : total < 0 ? "negative" : "positive";
  totalState.textContent = `Invested ${pct(total, 1)} | Cash ${pct(cash, 1)}`;
}

function renderAllocationEditor(artifact) {
  const total = Object.values(simulatedWeights).reduce((sum, value) => sum + Number(value || 0), 0);
  const cash = 1 - total;
  const totalState = document.getElementById("weightTotalState");
  totalState.className = total > 1.00001 ? "negative" : total < 0 ? "negative" : "positive";
  totalState.textContent = `Invested ${pct(total, 1)} | Cash ${pct(cash, 1)}`;
  document.getElementById("allocationEditorTable").innerHTML = "<tr><th>Strategy</th><th>Eligibility</th><th>Model Risk</th><th>Current</th><th>Proposed</th><th>Change</th><th>Trade $</th><th>Est. Cost</th><th>Action</th><th>Rationale</th></tr>" +
    (artifact.strategies || []).map((strategy) => {
      const current = strategy.current_weight || 0;
      const target = simulatedWeights[strategy.strategy_id] || 0;
      const change = target - current;
      const disabled = !strategy.allocation_eligibility?.eligible && current === 0;
      return `<tr>
        <td><button class="table-link" data-open-strategy="${strategy.strategy_id}"><strong>${strategy.name}</strong></button><small>${positionSummary(strategy)}</small></td>
        <td>${statusBadge(strategy.allocation_eligibility?.label || strategy.allocation_eligibility?.status)}</td><td>${statusBadge(current > 0 ? (strategy.live_risk_status || strategy.risk_status) : "not applicable")}</td><td>${pct(current, 1)}</td>
        <td><input class="weight-input" data-weight-id="${strategy.strategy_id}" type="number" min="0" max="15" step="0.1" value="${(target * 100).toFixed(1)}" ${disabled ? "disabled" : ""} aria-label="${strategy.name} target weight">%</td>
        <td class="${cls(change)}">${pct(change, 1)}</td><td class="${cls(change)}">${money(change * artifact.initial_capital)}</td><td>${money(Math.abs(change) * artifact.initial_capital * .0005)}</td>
        <td>${statusBadge(strategyActionLabel({ ...strategy, proposed_weight: target }))}</td>
        <td class="wrap-cell">${strategyRationale(strategy)}</td>
      </tr>`;
    }).join("");
  document.querySelectorAll("[data-weight-id]").forEach((input) => input.addEventListener("input", () => {
    simulatedWeights[input.dataset.weightId] = Math.max(0, Number(input.value || 0) / 100);
    updateWeightTotalsOnly();
  }));
  document.querySelectorAll("#allocationEditorTable [data-open-strategy]").forEach((button) => button.addEventListener("click", () => {
    renderDrawer(artifact.strategies.find((strategy) => strategy.strategy_id === button.dataset.openStrategy), artifact);
    setActiveTab("Strategy Monitor");
  }));
}

function renderSimulationResult(artifact) {
  const current = simulationResult?.metricsBefore || {
    sharpe: artifact.risk_summary?.portfolio_sharpe || 0,
    volatility: artifact.risk_summary?.portfolio_volatility || 0,
    var99: artifact.risk_summary?.portfolio_var_99 || 0,
    es95: artifact.risk_summary?.portfolio_expected_shortfall_95 || 0,
    maxDrawdown: artifact.risk_summary?.portfolio_max_drawdown || 0,
  };
  const proposed = simulationResult?.metrics || current;
  const rows = [
    ["Sharpe", current.sharpe, proposed.sharpe, false],
    ["Volatility", current.volatility, proposed.volatility, true],
    ["VaR 99%", current.var99, proposed.var99, true],
    ["ES 95%", current.es95, proposed.es95, true],
    ["Max Drawdown", current.maxDrawdown, proposed.maxDrawdown, true],
  ];
  const turnover = simulationResult?.turnover ?? 0;
  document.getElementById("riskBeforeAfter").innerHTML = rows.map(([label, before, after, percentage]) => {
    const outcome = compareMetricDelta(before, after, label !== "Sharpe", turnover);
    return `<div><span>${label}</span><div class="metric-comparison"><strong>${percentage ? pct(before, 2) : num(before)}</strong><span>to</span><strong class="${outcome.className}">${percentage ? pct(after, 2) : num(after)}</strong></div><small class="${outcome.className}">${outcome.label}</small></div>`;
  }).join("");
  const checks = simulationResult?.checks || [];
  const gates = simulationResult?.proposalGates || [];
  const sourceNote = simulationResult?.source === "python_rebalance_simulation"
    ? "Backend-tested Python simulation."
    : "Artifact-embedded official optimizer result.";
  const optimizerNote = simulationResult?.optimizerLabel
    ? `<p class="simulation-source">Optimizer: ${humanize(simulationResult.optimizerLabel)}</p>`
    : "";
  const factorKeys = [...new Set([
    ...Object.keys(simulationResult?.factorExposureBefore || {}),
    ...Object.keys(simulationResult?.factorExposureAfter || {}),
  ])].slice(0, 6);
  const factorHtml = factorKeys.length
    ? `<div class="factor-sim-grid">${factorKeys.map((factor) => `<div><span>${humanize(factor)}</span><strong>${num(simulationResult.factorExposureBefore[factor], 3)} → ${num(simulationResult.factorExposureAfter[factor], 3)}</strong></div>`).join("")}</div>`
    : "";
  const cashSemantics = artifact.factors?.cash_semantics || {};
  const cashHtml = Number.isFinite(simulationResult?.cashWeight)
    ? `<p>${cashSemantics.residual_cash_display_label || "Unallocated residual cash"} after simulation: <strong>${pct(simulationResult.cashWeight, 1)}</strong> · TBill/liquidity proxy exposure tracked separately in Factors tab.</p>`
    : "";
  const gateHtml = gates.length
    ? `<div class="proposal-gates">${gates.map((gate) => `<p>${statusBadge(gate.status)} <strong>${humanize(gate.metric || gate.gate)}</strong><br>${gate.text || gate.required_action || ""}</p>`).join("")}</div>`
    : "";
  document.getElementById("simulationChecks").innerHTML = `${optimizerNote}<p class="simulation-source">${sourceNote}</p>${cashHtml}${gateHtml}${factorHtml}` +
    checks.map((check) => `<p>${statusBadge(check.status)} <strong>${check.metric}</strong><br>${check.text}</p>`).join("");
}

async function runSimulation(artifact) {
  let payload = officialSimulationFromArtifact(artifact, simulatedWeights);
  if (!payload && await ensureSimulationApi(artifact, simulatedWeights)) {
    try {
      payload = await fetchBackendSimulation(artifact, simulatedWeights);
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    simulationResult = null;
    document.getElementById("decisionAuthorityStatus").textContent = "Simulation unavailable. Start scripts/run_workstation_server.py for custom weights or regenerate the dashboard artifact.";
    return false;
  }
  simulationResult = payload;
  renderAllocationEditor(artifact);
  renderSimulationResult(artifact);
  renderCompareAllocationKpis(artifact);
  renderApprovalStatusBar(artifact);
  renderAllocationSidePanels(artifact);
  document.getElementById("decisionAuthorityStatus").textContent = `Simulation completed (${payload.source}). Turnover ${pct(payload.turnover, 1)}, estimated cost ${money(payload.estimatedCost)}. Human approval is still required; execution remains disabled.`;
  return true;
}

function initializeSimulation(artifact) {
  simulatedWeights = Object.fromEntries((artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.current_weight || 0]));
  simulationResult = null;
  renderAllocationEditor(artifact);
}

function renderDailyExplanation(artifact) {
  const allocated = (artifact.strategies || []).filter((strategy) => strategy.current_weight > 0);
  const positive = allocated.filter((strategy) => (strategy.daily_pnl || 0) > 0);
  const negative = allocated.filter((strategy) => (strategy.daily_pnl || 0) < 0);
  const gains = positive.reduce((sum, strategy) => sum + strategy.daily_pnl, 0);
  const losses = Math.abs(negative.reduce((sum, strategy) => sum + strategy.daily_pnl, 0));
  const net = gains - losses;
  const factorBreaches = (artifact.risk_limits?.factors?.checks || []).filter((check) => check.status === "breach");
  document.getElementById("dailyExplanation").innerHTML = `
    <div class="explanation-headline"><div><span>Net daily PnL</span><strong class="${cls(net)}">${money(net)}</strong></div><div><span>Protection delivered</span><strong class="positive">${money(gains)}</strong></div><div><span>Loss offset ratio</span><strong>${losses ? pct(gains / losses, 1) : "n/a"}</strong></div><div><span>Allocated live breaches</span><strong class="positive">0</strong></div></div>
    <div class="explanation-grid">
      <section><h4>What happened</h4><p>${negative.length} allocated strategies lost money, while ${positive.length} strategies delivered positive offsets. Diversification worked partially, but the offsets covered only ${losses ? pct(gains / losses, 1) : "0%"} of gross losses.</p></section>
      <section><h4>Why risk remains</h4><p>${factorBreaches.map((check) => `${humanize(check.metric)} ${num(check.current_value, 3)} vs limit ${num(check.breach_threshold, 3)}`).join("; ") || "No factor hard breach."} Historical research drawdowns are shown separately and are not live breaches.</p></section>
      <section><h4>Required action</h4><p>Do not add capital simply because a strategy lost. Simulate reductions that lower breached factor exposure, preserve the strategies that offset the selloff, and approve only after the before/after risk and transaction-cost trade-off is documented.</p></section>
    </div>`;
}

function renderRealMatrix(id, rows, factors, mode = "exposure") {
  const el = document.getElementById(id);
  if (!el) return;
  const colWidth = mode === "correlation" ? "minmax(52px, 1fr)" : "minmax(66px, 1fr)";
  el.style.gridTemplateColumns = `minmax(140px, 1.8fr) repeat(${factors.length}, ${colWidth})`;
  const shortLabel = (label) => {
    const text = String(label || "").replaceAll("_", " ");
    return text.length > 22 ? `${text.slice(0, 20)}…` : text;
  };
  const headers = `<div class="cell matrix-label">Strategy</div>${factors.map((factor) => `<div class="cell matrix-label" title="${factor}">${shortLabel(factor)}</div>`).join("")}`;
  const cells = rows.map((row) => `<div class="cell matrix-label">${row.strategy || row.name}</div>` + factors.map((factor) => {
    const value = Number(row[factor] || 0);
    const abs = Math.abs(value);
    const color = mode === "correlation" && value <= -.75
      ? "var(--green-dim)"
      : abs >= .75
        ? "var(--red-dim)"
        : abs >= .45
          ? "oklch(29% 0.09 82)"
          : abs >= .15
            ? "var(--blue-dim)"
            : "var(--panel-3)";
    return `<div class="cell" style="background:${color}">${num(value, 2)}</div>`;
  }).join("")).join("");
  el.innerHTML = headers + cells;
}

function renderCardsAndMatrices(artifact) {
  const strategies = artifact.strategies || [];
  const contributors = strategies.filter((strategy) => strategy.current_weight > 0).sort((a, b) => (b.daily_pnl || 0) - (a.daily_pnl || 0));
  const positive = contributors.filter((strategy) => (strategy.daily_pnl || 0) > 0);
  const negative = contributors.filter((strategy) => (strategy.daily_pnl || 0) < 0);
  document.getElementById("contributors").innerHTML = positive.map((s) => {
    const util = Math.min(100, Math.abs(s.daily_pnl || 0) / Math.max(artifact.initial_capital * 0.002, 1) * 100);
    return `<div class="row-card"><span>${s.name}<small>${positionSummary(s)}</small><small class="usage-bar-wrap"><span class="usage-bar"><span style="width:${util}%"></span></span></small></span><strong class="positive">${money(s.daily_pnl || 0)}</strong></div>`;
  }).join("") || "<p class='empty-state'>No strategy offset today's loss.</p>";
  document.getElementById("detractors").innerHTML = negative.reverse().map((s) => {
    const util = Math.min(100, Math.abs(s.daily_pnl || 0) / Math.max(artifact.initial_capital * 0.002, 1) * 100);
    return `<div class="row-card"><span>${s.name}<small>${positionSummary(s)}</small><small class="usage-bar-wrap"><span class="usage-bar"><span style="width:${util}%"></span></span></small></span><strong class="negative">${money(s.daily_pnl || 0)}</strong></div>`;
  }).join("") || "<p class='empty-state'>No allocated strategy loss today.</p>";
  renderDailyExplanation(artifact);

  const checks = canonicalNonOkChecks(artifact);
  document.getElementById("alertList").innerHTML = checks.slice(0, 8).map((check) => `<p>${statusBadge(check.status)} <strong>${humanize(check.metric)}</strong><br>${check.explanation}</p>`).join("");
  const recs = artifact.recommendations || [];
  renderRecommendationPanels(recs);

  document.getElementById("riskBeforeAfter").innerHTML = (artifact.decision_review?.expected_impact?.risk_metric_changes || []).map((metric) => `<div><span>${metric.metric.replace("portfolio_", "")}</span><div class="bar"><span style="width:${metric.expected_outcome === "improved" ? 72 : 38}%"></span></div><strong>${num(metric.current, 3)} → ${num(metric.proposed, 3)}</strong></div>`).join("");
  const factorRows = artifact.factors?.strategy_by_factor_matrix || [];
  const factorNames = (artifact.factors?.factor_contribution_to_risk || []).slice(0, 6).map((row) => row.factor);
  renderRealMatrix("factorMatrix", factorRows, factorNames);
  renderSimulationResult(artifact);
  renderFactorExposureBars("portfolioFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorExposureBars("riskFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorNotes(artifact);
  renderNewsRiskSummary(artifact.news_risk);

  const corrRows = artifact.correlation?.matrix || [];
  const corrNames = corrRows.map((row) => row.strategy_id);
  const normalizedCorr = corrRows.map((row) => {
    const out = { strategy: row.name };
    row.values.forEach((value) => { out[value.strategy_id] = value.correlation; });
    return out;
  });
  renderRealMatrix("correlationMatrix", normalizedCorr, corrNames, "correlation");
  const corrSummary = artifact.correlation?.summary || {};
  document.getElementById("correlationSummary").innerHTML = [
    ["Strategies", corrSummary.strategy_count || 0],
    ["Pair count", corrSummary.pair_count || 0],
    ["Average abs. correlation", num(corrSummary.average_abs_correlation)],
    ["Maximum abs. correlation", num(corrSummary.max_abs_correlation)],
    ["Duplicate breaches", corrSummary.breach_count || 0],
    ["Hedge relationships", corrSummary.hedge_relationship_count || 0],
    ["Limit", num(corrSummary.limit)],
  ].map(([label, value]) => drawerMetric(label, value)).join("");
  document.getElementById("correlationPairs").innerHTML = "<tr><th>Left Strategy</th><th>Right Strategy</th><th>Correlation</th><th>Status</th><th>Allocation Read</th></tr>" +
    [...(corrSummary.breaches || []), ...(corrSummary.hedge_relationships || [])].map((pair) => `<tr><td>${pair.left_name}</td><td>${pair.right_name}</td><td class="${pair.correlation >= pair.limit ? "negative" : "positive"}">${num(pair.correlation)}</td><td>${statusBadge(pair.status)}</td><td>${pair.correlation > 0 ? "Compare research quality; block or redesign the weaker duplicate." : "Validate hedge stability, stress behavior, carry cost, and basis risk."}</td></tr>`).join("");
  document.getElementById("riskContribution").innerHTML = (artifact.factors?.factor_contribution_to_risk || []).slice(0, 8).map((row) => `<div><span>${humanizeFactor(row.factor, artifact)}</span><div class="bar"><span style="width:${clamp(row.risk_share * 100, 2, 100)}%"></span></div><strong>${pct(row.risk_share, 1)}</strong></div>`).join("");
}

function renderStaticTables(artifact) {
  document.getElementById("scenarioTable").innerHTML = "<tr><th>Scenario</th><th>Estimated Impact</th><th>Status</th><th>Main Drivers</th></tr>" +
    (artifact.factors?.scenario_shock_table || []).map((row) => `<tr><td>${row.scenario}</td><td class="${cls(row.estimated_portfolio_impact || 0)}">${pct(row.estimated_portfolio_impact || 0, 2)}</td><td>${statusBadge(row.risk_status)}</td><td>${(row.drivers || []).slice(0, 3).map((driver) => driver.factor).join(" / ")}</td></tr>`).join("");
  document.getElementById("factorLimitAlerts").innerHTML = (artifact.risk_limits?.factors?.checks || []).filter((check) => check.status !== "ok").map((check) => `<p>${statusBadge(check.status)} <strong>${check.metric}</strong><br>Current ${num(check.current_value, 3)}, limit ${num(check.breach_threshold, 3)}. ${check.action}</p>`).join("");

  const marketRows = artifact.market_monitor || [];
  document.getElementById("marketTable").innerHTML = "<tr><th>Market</th><th>Current</th><th>Daily Move</th><th>Status</th><th>Risk Interpretation</th></tr>" +
    marketRows.map((row) => `<tr><td>${row.ticker}</td><td>${Number(row.last || 0).toFixed(2)}</td><td class="${cls(row.daily_return || 0)}">${pct(row.daily_return || 0, 2)}</td><td>${statusBadge(row.status)}</td><td>${row.risk_interpretation}</td></tr>`).join("");
  document.getElementById("newsTable").innerHTML = "<tr><th>Severity</th><th>Topic</th><th>Headline</th><th>Risk Interpretation</th><th>Review</th></tr>" +
    (artifact.news_risk?.items || []).map((item) => `<tr><td>${statusBadge(item.severity)}</td><td>${item.topic}</td><td>${item.headline}</td><td>${item.risk_interpretation}</td><td>${item.human_review ? "Required" : "Monitor"}</td></tr>`).join("");

  const selected = artifact.strategies?.[0];
  document.getElementById("walkForwardTable").innerHTML = "<tr><th>Train</th><th>Test</th><th>Train Sharpe</th><th>Test Sharpe</th><th>Test Return</th><th>Test Max DD</th></tr>" +
    (selected?.walk_forward?.windows || []).slice(-12).map((window) => `<tr><td>${window.train_start} → ${window.train_end}</td><td>${window.test_start} → ${window.test_end}</td><td>${num(window.train_sharpe)}</td><td>${num(window.test_sharpe)}</td><td class="${cls(window.test_return || 0)}">${pct(window.test_return || 0, 2)}</td><td class="negative">${pct(window.test_max_drawdown || 0, 2)}</td></tr>`).join("");
  renderLiteratureStrategies(artifact.literature_strategy_backtests || {});
  renderCandidateStrategies();
  renderReplicationClone(artifact.replication_clone || {});

  const workflow = artifact.decision_workflow || {};
  const stages = [
    ["1. PM Proposal", workflow.stage_1_proposal?.status, workflow.stage_1_proposal?.proposal_owner],
    ["2. Independent Risk Review", workflow.stage_2_independent_risk_review?.status, workflow.stage_2_independent_risk_review?.system_conclusion],
    ["3. Decision Authority", workflow.stage_3_decision_authority?.status, workflow.stage_3_decision_authority?.system_recommended_outcome],
    ["4. Execution & Monitoring", workflow.stage_4_execution_and_monitoring?.execution_status, workflow.stage_4_execution_and_monitoring?.realized_outcome_status],
  ];
  document.getElementById("governanceFlow").innerHTML = stages.map(([title, status, detail]) => `<div class="governance-stage"><strong>${title}</strong>${statusBadge(status)}<span>${detail || "unassigned"}</span></div>`).join("");
  const review = artifact.decision_review || {};
  document.getElementById("dailyRiskMemo").innerHTML = `<p><strong>System conclusion:</strong> ${review.final_decision}</p><p><strong>Why:</strong> ${review.double_check_summary?.fail || 0} failed gates, ${review.double_check_summary?.warning || 0} warnings. Expected impact confidence is ${review.expected_impact?.confidence || "low"}.</p><p><strong>Current workflow:</strong> ${workflow.workflow_status || "pending"}.</p><p class="status-muted"><strong>Audit limitation:</strong> Decision events recorded in this browser session are stored in localStorage only; server-side audit persistence is not implemented.</p>`;
  document.getElementById("decisionAuthorityStatus").textContent = `System recommendation: ${workflow.stage_3_decision_authority?.system_recommended_outcome || "pending"}. Human decision: ${workflow.stage_3_decision_authority?.decision_outcome || "not recorded"}. Execution authorized: ${workflow.stage_3_decision_authority?.execution_authorized ? "yes" : "no"}.`;
  document.getElementById("decisionLog").innerHTML = "<tr><th>Time</th><th>Actor</th><th>Event</th><th>Note</th></tr>" +
    (workflow.audit_trail || []).map((event) => `<tr><td>${event.timestamp}</td><td>${event.actor}</td><td>${event.event}</td><td>${event.note}</td></tr>`).join("");
}

function renderWorkflow(artifact) {
  const gateBadge = (status) => statusBadge(status || "pending");
  document.getElementById("workflowTable").innerHTML = "<tr><th>Strategy</th><th>Hypothesis</th><th>Data</th><th>Signal</th><th>Backtest</th><th>Walk-Fwd</th><th>Risk Limits</th><th>Registry</th><th>Model Alloc</th><th>Approval</th><th>Next Action</th></tr>" +
    artifact.strategies.map((s) => {
      const wf = s.workflow_gates || {};
      const alloc = s.allocation_eligibility || {};
      return `<tr>
        <td><strong>${s.name}</strong><small>${s.current_weight > 0 ? `Allocated ${pct(s.current_weight)}` : "Research only"}</small></td>
        <td class="wrap-cell">${s.hypothesis || "—"}</td>
        <td>${gateBadge(wf.data_validation || s.evidence_status)}</td>
        <td>${gateBadge(wf.signal || s.signal_status)}</td>
        <td>${gateBadge(wf.backtest || s.research_quality_status)}</td>
        <td>${gateBadge(wf.walk_forward || (s.walk_forward?.windows?.length ? "complete" : "pending"))}</td>
        <td>${gateBadge(s.current_weight > 0 ? (s.live_risk_status || s.risk_status) : (s.research_quality_status || "research review"))}</td>
        <td>${gateBadge(wf.registry || s.registry_status || "registered")}</td>
        <td>${gateBadge(alloc.eligible ? (s.current_weight > 0 ? "allocated" : "eligible") : alloc.status || "pending")}</td>
        <td>${s.human_approval_required ? gateBadge("required") : gateBadge("not required")}</td>
        <td>${statusBadge(s.final_action_after_double_check || s.recommended_action || "review")}</td>
      </tr>`;
    }).join("");
  const workflowBanner = document.querySelector(".workflow");
  if (workflowBanner) {
    workflowBanner.innerHTML = [
      "Hypothesis", "Data validation", "Signal", "Backtest", "Walk-forward",
      "Risk limits", "Registry", "Model allocation eligibility", "Human approval",
    ].map((label) => `<span>${label}</span>`).join("");
  }
}

function renderRiskSidebar(artifact) {
  const headline = canonicalRiskHeadline(artifact);
  const factorScope = scopeSummary(artifact, "factor");
  const allocatedScope = scopeSummary(artifact, "allocated_strategy_live");
  document.getElementById("limitOkCount").textContent = (
    (scopeSummary(artifact, "portfolio_live").ok || 0)
    + (allocatedScope.ok || 0)
    + (factorScope.ok || 0)
    + (scopeSummary(artifact, "scenario").ok || 0)
    + (scopeSummary(artifact, "correlation").ok || 0)
    + (scopeSummary(artifact, "rebalance").ok || 0)
  );
  document.getElementById("limitWarningCount").textContent = headline.warnings || 0;
  document.getElementById("limitBreachCount").textContent = headline.blocking_breaches || 0;
  const allocatedBreaches = allocatedScope.breach || 0;
  document.getElementById("portfolioLimitState").innerHTML = `${statusBadge(headline.blocking_breaches ? "action required" : "within limits")}<br>${allocatedBreaches} allocated-model strategy breaches in canonical summary. Research-quality failures tracked separately.`;
  const workflow = artifact.decision_workflow || {};
  const review = workflow.stage_2_independent_risk_review || {};
  const authority = workflow.stage_3_decision_authority || {};
  const execution = workflow.stage_4_execution_and_monitoring || {};
  const quality = artifact.data_quality || {};
  document.getElementById("sidebarDecision").innerHTML = `
    ${statusBadge(review.system_conclusion || "review pending")}
    <strong>${humanize(review.status, "No independent review")}</strong>
    <span>${(review.blocking_objections || []).length} blocking objections, ${(review.warnings_and_conditions || []).length} warnings.</span>`;
  document.getElementById("sidebarGovernance").innerHTML = `
    <p><span>Human decision</span><strong>${humanize(authority.decision_outcome, "Not recorded")}</strong></p>
    <p><span>Execution</span><strong>${authority.execution_authorized ? "Authorized" : "Not authorized"}</strong></p>
    <p><span>Realized outcome</span><strong>${humanize(execution.realized_outcome_status, "Pending")}</strong></p>`;
  document.getElementById("sidebarDataQuality").innerHTML = `
    <p><span>Source</span><strong>${quality.source || "Unavailable"}</strong></p>
    <p><span>History</span><strong>${quality.earliest_strategy_start || "n/a"} to ${quality.latest_strategy_end || "n/a"}</strong></p>
    <p><span>Common window</span><strong>${quality.common_portfolio_risk_window_observations || 0} days</strong></p>
    <p><span>Missing series</span><strong>${(quality.missing_return_series || []).length}</strong></p>`;
  document.getElementById("headerRegime").textContent = "Disinflation / Risk-On but Fragile (proxy)";
  renderLiveDataState(artifact);
  document.getElementById("macroRegimeLabel").textContent = "Strategy-specific regime diagnostics";
  document.getElementById("macroRegimeNote").textContent = "The current prototype evaluates equity, realized-volatility, credit, rates, and USD regimes. A single live macro regime label remains pending validated release-timed macro inputs.";
}

function renderDrawer(strategy, artifact) {
  if (!strategy) return;
  activeStrategy = strategy;
  activeArtifact = artifact;
  const packet = strategy.risk_packet || {};
  const summary = packet.summary_statistics || {};
  const walk = strategy.walk_forward || {};
  const series = packet.chart_series || {};
  const current = strategy.current_weight || 0;
  const proposed = strategy.proposed_weight || 0;
  document.getElementById("selectedStrategyName").textContent = strategy.name;
  document.getElementById("selectedStrategyType").textContent = `${strategy.strategy_type} | ${strategy.strategy_id}`;
  document.getElementById("drawerAlloc").textContent = pct(current);
  document.getElementById("drawerProposed").textContent = pct(proposed);
  const statusEl = document.querySelector(".drawer-kpis div:nth-child(3) strong");
  statusEl.innerHTML = statusBadge(strategy.risk_status);
  setBadgeElement(document.querySelector(".drawer-heading .badge"), strategy.final_action_after_double_check);
  drawSeriesReturnAndDrawdown(document.getElementById("strategyCanvas"), series);
  const weightInput = document.getElementById("drawerWeightInput");
  if (weightInput) {
    weightInput.value = Number(simulatedWeights[strategy.strategy_id] ?? proposed).toFixed(4);
    weightInput.disabled = !strategy.allocation_eligibility?.eligible && current === 0;
  }
  renderDrawerView(strategy, activeDrawerView);
}

function installDrawerWeightControls(artifact) {
  const applyWeight = async (delta = 0) => {
    if (!activeStrategy) return;
    const input = document.getElementById("drawerWeightInput");
    const base = Number(input?.value || simulatedWeights[activeStrategy.strategy_id] || activeStrategy.proposed_weight || 0);
    const next = Math.max(0, Math.min(0.25, base + delta));
    simulatedWeights[activeStrategy.strategy_id] = next;
    if (input) input.value = next.toFixed(4);
    setActiveTab("Allocation & Rebalance");
    renderAllocationEditor(artifact);
    await runSimulation(artifact);
  };
  document.getElementById("drawerWeightUp")?.addEventListener("click", () => applyWeight(0.01));
  document.getElementById("drawerWeightDown")?.addEventListener("click", () => applyWeight(-0.01));
  document.getElementById("drawerApplyWeight")?.addEventListener("click", async () => {
    if (!activeStrategy) return;
    const input = document.getElementById("drawerWeightInput");
    const next = Math.max(0, Math.min(0.25, Number(input?.value || 0)));
    simulatedWeights[activeStrategy.strategy_id] = next;
    setActiveTab("Allocation & Rebalance");
    renderAllocationEditor(artifact);
    await runSimulation(artifact);
  });
  document.getElementById("drawerGoAllocation")?.addEventListener("click", () => {
    if (activeStrategy) {
      setActiveTab("Allocation & Rebalance");
      renderAllocationEditor(artifact);
    }
  });
}

function drawerMetric(label, value, tone = "") {
  return `<div class="drawer-metric"><span>${label}</span><strong class="${tone}">${value}</strong></div>`;
}

function renderDrawerView(strategy, view) {
  activeDrawerView = view;
  document.querySelectorAll("#drawerTabs button").forEach((button) => button.classList.toggle("active", button.dataset.drawerView === view));
  const packet = strategy.risk_packet || {};
  const summary = packet.summary_statistics || {};
  const drawdown = packet.drawdown_behavior || {};
  const tail = packet.tail_risk || {};
  const walk = strategy.walk_forward || {};
  const content = document.getElementById("drawerDetailContent");
  if (view === "evidence") {
    content.innerHTML = `<div class="drawer-section-grid">
      ${drawerMetric("Backtest history", `${strategy.backtest_evidence?.years?.toFixed(1) || "0.0"} years`)}
      ${drawerMetric("Observations", String(summary.observations || 0))}
      ${drawerMetric("Net Sharpe", num(summary.sharpe))}
      ${drawerMetric("Max historical DD", pct(drawdown.max_drawdown || 0, 1), "negative")}
      ${drawerMetric("OOS windows", String(walk.number_of_windows || 0))}
      ${drawerMetric("Average OOS Sharpe", num(walk.average_test_sharpe), cls(walk.average_test_sharpe || 0))}
      ${drawerMetric("Positive OOS windows", pct(walk.positive_window_rate || 0, 0))}
      ${drawerMetric("Research status", humanize(strategy.research_status))}
    </div>
    <div class="drawer-callout"><strong>Bias controls</strong><p>${strategy.bias_controls?.lookahead_bias || "Not documented"}</p><p>${strategy.bias_controls?.survivorship_bias || "Not documented"}</p><p>${strategy.bias_controls?.oos_walk_forward || "Not documented"}</p></div>`;
  } else if (view === "limits") {
    const checks = [...(strategy.risk_limit_checks || []), ...(strategy.research_quality_checks || [])];
    content.innerHTML = `<div class="drawer-list">${checks.map((check) => `<div class="drawer-list-row"><div>${statusBadge(check.status)}<strong>${humanize(check.metric)}</strong><span>${check.explanation}</span></div><div><span>Current</span><strong>${typeof check.current_value === "number" ? num(check.current_value, 3) : humanize(check.current_value)}</strong><span>Limit ${typeof check.breach_threshold === "number" ? num(check.breach_threshold, 3) : humanize(check.breach_threshold)}</span></div></div>`).join("")}</div>`;
  } else if (view === "positions") {
    const positions = strategy.position_packet?.latest_positions || [];
    content.innerHTML = `<div class="drawer-section-grid">
      ${drawerMetric("Gross exposure", pct(strategy.position_packet?.latest_gross_exposure || 0, 1))}
      ${drawerMetric("Net exposure", pct(strategy.position_packet?.latest_net_exposure || 0, 1))}
      ${drawerMetric("Annualized turnover", `${num(strategy.turnover?.annualized_turnover, 1)}x`)}
      ${drawerMetric("Annualized cost drag", pct(strategy.turnover?.annualized_cost_drag || 0, 2))}
    </div><div class="drawer-list">${positions.map((position) => `<div class="drawer-list-row"><strong>${position.ticker}</strong><strong class="${cls(position.weight)}">${pct(position.weight, 1)}</strong></div>`).join("") || "<div class='drawer-callout'>No active positions.</div>"}</div>`;
  } else if (view === "decision") {
    const review = strategy.decision_review || {};
    content.innerHTML = `<div class="drawer-callout decision-callout">${statusBadge(strategy.final_action_after_double_check)}<h3>${strategy.final_action_after_double_check}</h3><p>${strategy.allocation_eligibility?.reason || "Eligibility not documented."}</p></div>
      <div class="drawer-section-grid">
        ${drawerMetric("Current allocation", pct(strategy.current_weight || 0))}
        ${drawerMetric("Proposed allocation", pct(strategy.proposed_weight || 0))}
        ${drawerMetric("Trade side", strategy.rebalance_trade?.side || "HOLD")}
        ${drawerMetric("Estimated cost", money(strategy.rebalance_trade?.estimated_cost || 0))}
        ${drawerMetric("Allocation blocked", review.allocation_blocked ? "Yes" : "No", review.allocation_blocked ? "negative" : "positive")}
        ${drawerMetric("Human approval", strategy.human_approval_required ? "Required" : "Not required")}
      </div><div class="drawer-list">${(review.checks || []).map((check) => `<div class="drawer-list-row"><div>${statusBadge(check.status)}<strong>${humanize(check.gate)}</strong><span>${check.explanation}</span></div></div>`).join("")}</div>`;
  } else {
    const factors = strategy.factor_exposure?.latest || {};
    const maxFactor = Math.max(...Object.values(factors).map((value) => Math.abs(value)), 0.01);
    content.innerHTML = `<div class="drawer-section-grid">
      ${drawerMetric("Current drawdown", pct(strategy.current_drawdown || 0, 1), "negative")}
      ${drawerMetric("Latest rolling Sharpe", num(strategy.rolling_sharpe), cls(strategy.rolling_sharpe || 0))}
      ${drawerMetric("99% VaR", pct(tail.var_99 || 0, 2), "negative")}
      ${drawerMetric("95% Expected Shortfall", pct(tail.expected_shortfall_95 || 0, 2), "negative")}
      ${drawerMetric("Model risk", strategy.current_weight > 0 ? humanize(strategy.live_risk_status || strategy.risk_status) : "Not applicable (research only)")}
      ${drawerMetric("Research quality", humanize(strategy.research_quality_status || strategy.research_status))}
      ${drawerMetric("Allocation eligibility", humanize(strategy.allocation_eligibility?.status))}
    </div>
    <div class="drawer-callout"><strong>What happened</strong><p>${strategy.risk_manager_question_answered?.what_happened || "Not available"}</p><strong>Why</strong><p>${strategy.risk_manager_question_answered?.why || "Not available"}</p></div>
    <div class="mini-grid"><div><h4>Factor Exposure</h4><div class="mini-bars">${Object.entries(factors).slice(0, 6).map(([label, value]) => `<div><span>${humanize(label)}</span><div class="bar"><span style="width:${Math.min(100, Math.abs(value) / maxFactor * 100)}%"></span></div><strong class="${cls(value)}">${num(value)}</strong></div>`).join("")}</div></div><div><h4>Failure Modes</h4><ul>${(strategy.failure_modes || []).map((mode) => `<li>${mode}</li>`).join("")}</ul></div></div>`;
  }
}

function installStrategyMonitorControls(artifact) {
  const controls = ["strategySearch", "strategyAllocationFilter", "strategyRiskFilter"].map((id) => document.getElementById(id));
  const apply = () => {
    const search = document.getElementById("strategySearch").value.trim().toLowerCase();
    const allocation = document.getElementById("strategyAllocationFilter").value;
    const risk = document.getElementById("strategyRiskFilter").value;
    let visible = 0;
    document.querySelectorAll("#monitorTable tr[data-strategy]").forEach((row) => {
      const show = (!search || row.dataset.search.includes(search))
        && (allocation === "all" || row.dataset.allocated === allocation)
        && (risk === "all" || row.dataset.risk === risk);
      row.hidden = !show;
      visible += show ? 1 : 0;
    });
    const allocated = artifact.strategies.filter((strategy) => strategy.current_weight > 0).length;
    const eligible = artifact.strategies.filter((strategy) => strategy.allocation_eligibility?.eligible).length;
    const modelBreaches = artifact.strategies.filter((strategy) => strategy.current_weight > 0 && strategy.live_risk_status === "breach").length;
    document.getElementById("monitorSummary").innerHTML = `<span><strong>${visible}</strong> visible</span><span><strong>${allocated}</strong> model allocated</span><span><strong>${eligible}</strong> eligible</span><span class="${modelBreaches ? "negative" : "positive"}"><strong>${modelBreaches}</strong> allocated-model breaches</span>`;
  };
  controls.forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", apply));
  document.querySelectorAll("#drawerTabs button").forEach((button) => button.addEventListener("click", () => renderDrawerView(activeStrategy, button.dataset.drawerView)));
  apply();
}

function metricTableRows(packet, strategy) {
  const summary = packet.summary_statistics || {};
  const distribution = packet.distribution_shape || {};
  const tail = packet.tail_risk || {};
  const drawdown = packet.drawdown_behavior || {};
  const stability = packet.time_stability || {};
  const benchmark = packet.comparison_vs_benchmark || {};
  return [
    ["Summary", "Annual return / volatility", `${pct(summary.annual_return || 0, 2)} / ${pct(summary.annual_volatility || 0, 2)}`, "Judge return against the risk budget."],
    ["Summary", "Sharpe / Sortino / Calmar", `${num(summary.sharpe)} / ${num(summary.sortino)} / ${num(summary.calmar)}`, "Three views of risk-adjusted performance."],
    ["Summary", "Win rate / payoff ratio", `${pct(summary.win_rate || 0, 1)} / ${num(summary.payoff_ratio)}`, "A high hit rate can still hide large losses."],
    ["Distribution", "Skew / excess kurtosis", `${num(distribution.skewness)} / ${num(distribution.excess_kurtosis)}`, "Negative skew and fat tails require tighter limits."],
    ["Tail", "VaR 95 / ES 95", `${pct(tail.var_95 || 0, 2)} / ${pct(tail.expected_shortfall_95 || 0, 2)}`, "ES estimates loss after VaR is breached."],
    ["Drawdown", "Max / current drawdown", `${pct(drawdown.max_drawdown || 0, 2)} / ${pct(drawdown.current_drawdown || 0, 2)}`, "Distinguish historic failure from current pain."],
    ["Drawdown", "Max duration / episodes", `${drawdown.max_drawdown_duration_days || 0} days / ${drawdown.drawdown_episode_count || 0}`, "How long capital can remain underwater."],
    ["Stability", "63D rolling Sharpe latest / min", `${num(stability["63d"]?.latest_rolling_sharpe)} / ${num(stability["63d"]?.min_rolling_sharpe)}`, "Checks recent decay and worst rolling period."],
    ["Stability", "252D positive Sharpe rate", pct(stability["252d"]?.positive_sharpe_rate || 0, 0), "Persistence across long rolling windows."],
    ["Benchmark", "Beta / correlation", `${num(benchmark.beta)} / ${num(benchmark.correlation)}`, "Tests whether alpha is disguised market beta."],
    ["Evidence", "Bias controls", strategy.bias_controls?.lookahead_bias || "Not documented", "Every allocation requires defensible evidence."],
  ];
}

function renderStrategyChecklist(strategy, packet) {
  const summary = packet.summary_statistics || {};
  const tail = packet.tail_risk || {};
  const drawdown = packet.drawdown_behavior || {};
  const stability = packet.time_stability || {};
  const benchmark = packet.comparison_vs_benchmark || {};
  const sections = [
    ["1. Summary Statistics", "attached", `Net Sharpe ${num(summary.sharpe)}, annual return ${pct(summary.annual_return || 0, 1)}, annual vol ${pct(summary.annual_volatility || 0, 1)}.`],
    ["2. Distribution Shape", "attached", `Skew ${num(packet.distribution_shape?.skewness)}, excess kurtosis ${num(packet.distribution_shape?.excess_kurtosis)}. Check whether volatility understates tail risk.`],
    ["3. Tail Risk", "attached", `99% VaR ${pct(tail.var_99 || 0, 2)}, 99% ES ${pct(tail.expected_shortfall_99 || 0, 2)}. Compare loss with allocation budget.`],
    ["4. Drawdown Behavior", "attached", `Max DD ${pct(drawdown.max_drawdown || 0, 1)}, current DD ${pct(drawdown.current_drawdown || 0, 1)}, max duration ${drawdown.max_drawdown_duration_days || 0} days.`],
    ["5. Time Stability", "attached", `Latest 63D Sharpe ${num(stability["63d"]?.latest_rolling_sharpe)}, 252D positive Sharpe rate ${pct(stability["252d"]?.positive_sharpe_rate || 0, 0)}.`],
    ["6. Regime Breakdown", "attached", `Best: ${strategy.regime_fit?.best_regime || "n/a"} (${num(strategy.regime_fit?.best_regime_sharpe)}). Worst: ${strategy.regime_fit?.worst_regime || "n/a"} (${num(strategy.regime_fit?.worst_regime_sharpe)}).`],
    ["7. Benchmark / Other Strategies", "attached", `SPY correlation ${num(benchmark.correlation)}; average absolute correlation to other strategies ${num(packet.comparison_vs_other_strategies?.average_abs_correlation_to_others)}.`],
    ["8. Final Risk Manager Decision", strategy.decision_review?.allocation_blocked ? "blocked" : "human review", `${strategy.final_action_after_double_check}. Candidate action was ${strategy.decision_review?.candidate_action || strategy.recommended_action}.`],
  ];
  document.getElementById("riskChecklist").innerHTML = sections.map(([title, status, text]) => `
    <section class="check-section"><header><h3>${title}</h3>${statusBadge(status)}</header><p>${text}</p></section>`).join("");
}

function openStrategyReview(strategy, artifact) {
  if (!strategy) return;
  activeStrategy = strategy;
  activeArtifact = artifact;
  const packet = strategy.risk_packet || {};
  const summary = packet.summary_statistics || {};
  const distribution = packet.distribution_shape || {};
  const tail = packet.tail_risk || {};
  const drawdown = packet.drawdown_behavior || {};
  const benchmark = packet.comparison_vs_benchmark || {};
  const series = packet.chart_series || {};
  const returns = (series.returns || []).filter(Number.isFinite);
  const current = strategy.current_weight || 0;
  const proposed = strategy.proposed_weight || 0;
  document.getElementById("dialogStrategyId").textContent = strategy.strategy_id;
  document.getElementById("dialogStrategyName").textContent = strategy.name;
  document.getElementById("dialogStrategyMeta").textContent = `${strategy.strategy_type} | ${strategy.backtest_evidence?.data_source || "source unavailable"} | ${strategy.backtest_evidence?.start_date || "n/a"} to ${strategy.backtest_evidence?.end_date || "n/a"}`;
  setBadgeElement(document.getElementById("dialogDecisionBadge"), strategy.final_action_after_double_check);
  document.getElementById("reviewKpis").innerHTML = [
    ["Ann. Return", pct(summary.annual_return || 0, 2), cls(summary.annual_return || 0)],
    ["Ann. Vol", pct(summary.annual_volatility || 0, 2), "neutral"],
    ["Sharpe", num(summary.sharpe), "neutral"],
    ["Sortino", num(summary.sortino), "neutral"],
    ["Calmar", num(summary.calmar), "neutral"],
    ["Win Rate", pct(summary.win_rate || 0, 1), "neutral"],
    ["Skew", num(distribution.skewness), distribution.skewness < -0.5 ? "warning-text" : "neutral"],
    ["Max DD", pct(drawdown.max_drawdown || 0, 2), "negative"],
  ].map(([label, value, klass]) => `<article class="kpi-card"><span>${label}</span><strong class="${klass}">${value}</strong></article>`).join("");
  document.getElementById("tailRiskPanel").innerHTML = [
    ["95% VaR", tail.var_95], ["99% VaR", tail.var_99], ["95% ES", tail.expected_shortfall_95],
    ["99% ES", tail.expected_shortfall_99], ["Worst Day", summary.worst_day], ["Best Day", summary.best_day],
  ].map(([label, value]) => `<div><span>${label}</span><strong class="${cls(value || 0)}">${pct(value || 0, 2)}</strong></div>`).join("");
  const latestFactors = strategy.factor_exposure?.latest || {};
  const factorMax = Math.max(...Object.values(latestFactors).map((value) => Math.abs(value)), 0.01);
  document.getElementById("factorReviewPanel").innerHTML = Object.entries(latestFactors).map(([label, value]) => `
    <div><span>${label.replaceAll("_", " ")}</span><div class="bar"><span style="width:${Math.min(100, Math.abs(value) / factorMax * 100)}%"></span></div><strong class="${cls(value)}">${num(value)}</strong></div>`).join("");
  document.getElementById("decisionPacket").innerHTML = `
    <p><strong>Hypothesis:</strong> ${strategy.hypothesis}</p>
    <p><strong>Signal:</strong> ${strategy.signal_summary}</p>
    <p><strong>Allocation and cost:</strong> ${pct(current)} current to ${pct(proposed)} proposed. ${strategy.rebalance_trade?.side || "HOLD"} ${money(strategy.rebalance_trade?.notional || 0)}, estimated cost ${money(strategy.rebalance_trade?.estimated_cost || 0)}.</p>
    <p><strong>Double-check decision:</strong> ${strategy.final_action_after_double_check}. Allocation blocked: ${strategy.decision_review?.allocation_blocked ? "yes" : "no"}.</p>
    <p><strong>Evidence:</strong> ${strategy.backtest_evidence?.years?.toFixed(1) || 0} years; ${strategy.walk_forward?.number_of_windows || 0} walk-forward windows; ${strategy.bias_controls?.oos_walk_forward || "OOS not documented"}.</p>
    <p><strong>Limit status:</strong> ${strategy.risk_limit_summary?.breach || 0} breaches, ${strategy.risk_limit_summary?.warning || 0} warnings. Human approval required: ${strategy.human_approval_required ? "yes" : "no"}.</p>`;
  document.getElementById("literatureDetailSummary").innerHTML = "<tr><th>Category</th><th>Metric</th><th>Value</th><th>Risk Manager Read</th></tr>" +
    metricTableRows(packet, strategy).map(([category, metric, value, read]) => `<tr><td>${category}</td><td>${metric}</td><td>${value}</td><td>${read}</td></tr>`).join("");
  const regimes = packet.regime_breakdown || {};
  document.getElementById("literatureRegimeBreakdown").innerHTML = "<tr><th>Regime</th><th>Obs.</th><th>Return</th><th>Sharpe</th><th>Max DD</th><th>ES 95</th></tr>" +
    Object.entries(regimes).map(([name, value]) => `<tr><td>${name.replaceAll("_", " ")}</td><td>${value.observations || 0}</td><td class="${cls(value.annual_return || 0)}">${pct(value.annual_return || 0, 1)}</td><td>${num(value.sharpe)}</td><td class="negative">${pct(value.max_drawdown || 0, 1)}</td><td class="negative">${pct(value.expected_shortfall_95 || 0, 2)}</td></tr>`).join("");
  document.getElementById("literatureBenchmarkComparison").innerHTML = "<tr><th>Benchmark</th><th>Beta</th><th>Correlation</th><th>Alpha</th><th>Tracking Error</th><th>Info Ratio</th></tr>" +
    `<tr><td>${benchmark.benchmark || "SPY"}</td><td>${num(benchmark.beta)}</td><td>${num(benchmark.correlation)}</td><td>${pct(benchmark.alpha_annualized || 0, 2)}</td><td>${pct(benchmark.tracking_error || 0, 2)}</td><td>${num(benchmark.information_ratio)}</td></tr>`;
  document.getElementById("literatureWorstDays").innerHTML = "<tr><th>Date</th><th>Return</th><th>Risk Read</th></tr>" +
    (tail.worst_10_days || []).map((day) => `<tr><td>${day.date}</td><td class="negative">${pct(day.return || 0, 2)}</td><td>Review event, regime, liquidity, and cross-strategy loss clustering.</td></tr>`).join("");
  renderStrategyChecklist(strategy, packet);
  drawDistribution(document.getElementById("distributionCanvas"), returns);
  drawSeriesReturnAndDrawdown(document.getElementById("detailReturnCanvas"), series);
  drawRollingSeries(document.getElementById("rollingCanvas"), series.rolling_63d_sharpe || []);
  const dialog = document.getElementById("strategyDialog");
  if (!dialog.open) dialog.showModal();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function loadLocalDecisionEvents() {
  try {
    localDecisionEvents = JSON.parse(localStorage.getItem("riskManagerDecisionEvents") || "[]").filter((event) => event.actor !== "Risk Manager QA");
  } catch {
    localDecisionEvents = [];
  }
}

function renderDecisionLog(artifact) {
  const workflowEvents = artifact.decision_workflow?.audit_trail || [];
  const events = [...workflowEvents, ...localDecisionEvents].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  document.getElementById("decisionLog").innerHTML = "<tr><th>Time</th><th>Actor</th><th>Event</th><th>Note</th></tr>" +
    events.map((event) => `<tr><td>${escapeHtml(event.timestamp)}</td><td>${escapeHtml(event.actor)}</td><td>${statusBadge(event.event)}</td><td class="wrap-cell">${escapeHtml(event.note)}</td></tr>`).join("");
}

async function recordDecision(artifact, action) {
  const reviewer = document.getElementById("decisionReviewer").value.trim();
  const note = document.getElementById("decisionNote").value.trim();
  if (!reviewer || !note) {
    document.getElementById("decisionAuthorityStatus").textContent = "Reviewer and decision note are required before recording a human decision.";
    return;
  }
  if (!simulationResult) {
    const simulated = await runSimulation(artifact);
    if (!simulated || !simulationResult) {
      document.getElementById("decisionAuthorityStatus").textContent = "Cannot record a decision until a valid simulation is available.";
      return;
    }
  }
  const blockers = simulationResult.checks.filter((check) => check.status === "breach");
  const gateBlockers = (simulationResult.proposalGates || []).filter((gate) => gate.status === "breach");
  if (action === "Approved for execution review" && (blockers.length || gateBlockers.length)) {
    document.getElementById("decisionAuthorityStatus").textContent = `Approval blocked by ${blockers.length + gateBlockers.length} hard simulation or proposal gate checks. Modify or reject the proposal. Human approval does not authorize execution.`;
    return;
  }
  const event = {
    timestamp: new Date().toISOString(),
    actor: reviewer,
    event: action,
    note,
    execution_authorized: false,
    simulated_weights: simulatedWeights,
    simulation: {
      turnover: simulationResult.turnover,
      estimated_cost: simulationResult.estimatedCost,
      hard_breaches: blockers.map((check) => check.metric),
    },
  };
  localDecisionEvents.push(event);
  localStorage.setItem("riskManagerDecisionEvents", JSON.stringify(localDecisionEvents));
  renderDecisionLog(artifact);
  document.getElementById("decisionAuthorityStatus").textContent = `${action} recorded by ${reviewer}. No trade was executed; execution authorization remains disabled.`;
}

async function generateDailyReport(artifact) {
  if (!simulationResult) {
    const simulated = await runSimulation(artifact);
    if (!simulated || !simulationResult) {
      document.getElementById("generatedReport").innerHTML = "<section><h3>Report unavailable</h3><p>Daily report requires a valid rebalance simulation. Adjust weights or start scripts/run_workstation_server.py, then simulate again.</p></section>";
      setActiveTab("Daily Risk Report / Decision Log");
      return;
    }
  }
  const allocated = (artifact.strategies || []).filter((strategy) => strategy.current_weight > 0);
  const winners = allocated.filter((strategy) => strategy.daily_pnl > 0).sort((a, b) => b.daily_pnl - a.daily_pnl);
  const losers = allocated.filter((strategy) => strategy.daily_pnl < 0).sort((a, b) => a.daily_pnl - b.daily_pnl);
  const breaches = simulationResult.checks.filter((check) => check.status === "breach");
  const warnings = simulationResult.checks.filter((check) => check.status === "warning");
  document.getElementById("generatedReport").innerHTML = `
    <header><div><span>Daily risk report</span><h2>${artifact.as_of_date} Multi-Strategy Portfolio Review</h2></div>${statusBadge(breaches.length ? "modification required" : "human review")}</header>
    <section class="report-metrics"><div><span>Daily PnL</span><strong class="${cls(artifact.portfolio_series?.returns?.at(-1) || 0)}">${money((artifact.portfolio_series?.returns?.at(-1) || 0) * artifact.initial_capital)}</strong></div><div><span>Portfolio Sharpe</span><strong>${num(artifact.risk_summary?.portfolio_sharpe)}</strong></div><div><span>Simulated Sharpe</span><strong>${num(simulationResult.metrics.sharpe)}</strong></div><div><span>Trade cost</span><strong>${money(simulationResult.estimatedCost)}</strong></div></section>
    <section><h3>What happened</h3><p>${winners.length} allocated strategies delivered positive offsets and ${losers.length} lost money. Best protection: ${winners.slice(0, 3).map((strategy) => `${strategy.name} ${money(strategy.daily_pnl)}`).join(", ") || "none"}. Largest loss drivers: ${losers.slice(0, 3).map((strategy) => `${strategy.name} ${money(strategy.daily_pnl)}`).join(", ") || "none"}.</p></section>
    <section><h3>Simulation and limits</h3><p>Turnover ${pct(simulationResult.turnover, 1)}, estimated transaction cost ${money(simulationResult.estimatedCost)}, simulated volatility ${pct(simulationResult.metrics.volatility, 2)}, VaR 99% ${pct(simulationResult.metrics.var99, 2)}, ES 95% ${pct(simulationResult.metrics.es95, 2)}, max drawdown ${pct(simulationResult.metrics.maxDrawdown, 2)}.</p><p>${breaches.length} hard checks and ${warnings.length} warnings remain. ${breaches.map((check) => check.metric).join(", ") || "No hard simulation breach."}</p></section>
    <section><h3>Governance decision</h3><p>${localDecisionEvents.at(-1) ? `${escapeHtml(localDecisionEvents.at(-1).event)} by ${escapeHtml(localDecisionEvents.at(-1).actor)}: ${escapeHtml(localDecisionEvents.at(-1).note)}` : "Human decision not yet recorded."} Execution remains separate and unauthorized.</p></section>`;
  setActiveTab("Daily Risk Report / Decision Log");
}

function downloadBlob(filename, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function installOperationalControls(artifact) {
  loadLocalDecisionEvents();
  renderDecisionLog(artifact);
  document.getElementById("useSystemProposal").addEventListener("click", async () => {
    simulatedWeights = Object.fromEntries((artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.proposed_weight || 0]));
    simulationResult = null;
    renderAllocationEditor(artifact);
    await runSimulation(artifact);
  });
  document.getElementById("resetWeights").addEventListener("click", async () => {
    initializeSimulation(artifact);
    await runSimulation(artifact);
  });
  document.getElementById("simulateWeights").addEventListener("click", () => runSimulation(artifact));
  const rebalanceJump = document.getElementById("openRebalanceTab");
  if (rebalanceJump) rebalanceJump.addEventListener("click", () => setActiveTab("Allocation & Rebalance"));
  document.getElementById("approveDecision").addEventListener("click", () => recordDecision(artifact, "Approved for execution review"));
  document.getElementById("modifyDecision").addEventListener("click", () => recordDecision(artifact, "Modification requested"));
  document.getElementById("rejectDecision").addEventListener("click", () => recordDecision(artifact, "Proposal rejected"));
  document.getElementById("generateReport").addEventListener("click", () => generateDailyReport(artifact));
  document.getElementById("printReport").addEventListener("click", async () => {
    await generateDailyReport(artifact);
    setTimeout(() => window.print(), 100);
  });
  document.getElementById("exportJson").addEventListener("click", () => downloadBlob(`risk-decision-${artifact.as_of_date}.json`, "application/json", JSON.stringify({
    as_of_date: artifact.as_of_date,
    simulated_weights: simulatedWeights,
    simulation: simulationResult,
    decisions: localDecisionEvents,
    execution_authorized: false,
  }, null, 2)));
  document.getElementById("exportCsv").addEventListener("click", () => {
    const rows = [["strategy_id", "strategy", "current_weight", "target_weight", "change", "estimated_cost"]];
    (artifact.strategies || []).forEach((strategy) => {
      const target = simulatedWeights[strategy.strategy_id] || 0;
      const change = target - (strategy.current_weight || 0);
      rows.push([strategy.strategy_id, strategy.name, strategy.current_weight || 0, target, change, Math.abs(change) * artifact.initial_capital * .0005]);
    });
    downloadBlob(`allocation-simulation-${artifact.as_of_date}.csv`, "text/csv", rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"));
  });
}

async function init() {
  renderTabs();
  let artifact = await loadArtifact();
  mergeLiveOverlay(artifact, await loadLiveOverlay());
  activeArtifact = artifact;
  document.getElementById("asOfDate").textContent = artifact.as_of_date;
  document.getElementById("capital").textContent = money(artifact.initial_capital);
  document.getElementById("strategyCount").textContent = artifact.strategy_count;
  renderKpis(artifact);
  renderHistoricalResearchContext(artifact);
  renderGlobalStatusBar(artifact);
  renderTables(artifact);
  renderRiskSidebar(artifact);
  redrawAllCharts(artifact);
  renderCardsAndMatrices(artifact);
  renderWorkstationPanels(artifact);
  installOperationalControls(artifact);
  installLiveControls(artifact);
  installDrawerWeightControls(artifact);
  installChartObservers(artifact);
  renderStaticTables(artifact);
  renderWorkflow(artifact);
  renderDrawer(artifact.strategies[2] || artifact.strategies[0], artifact);
  installStrategyMonitorControls(artifact);
  await runSimulation(artifact);
  document.getElementById("openStrategyReview").addEventListener("click", () => openStrategyReview(activeStrategy, activeArtifact));
  document.getElementById("closeStrategyReview").addEventListener("click", () => document.getElementById("strategyDialog").close());
  document.getElementById("strategyDialog").addEventListener("click", (event) => {
    if (event.target.id === "strategyDialog") event.target.close();
  });
  const litResults = artifact.literature_strategy_backtests?.results || [];
  if (litResults.length) renderResearchLabPanels({ ...litResults[0], _index: 0 });
}

init();
