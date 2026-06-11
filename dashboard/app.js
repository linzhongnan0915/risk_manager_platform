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

const tabCompactLabels = [
  "Command Center",
  "Strategies",
  "Allocation",
  "Factors",
  "Correlation",
  "Market & Macro",
  "Research Lab",
  "Workflow",
  "Daily Report",
];

const NAV_SECTIONS = [
  { group: "Portfolio", tab: "Portfolio Command Center", label: "Command Center", icon: "portfolio" },
  { group: "Strategies", tab: "Strategy Monitor", label: "Strategies", icon: "line" },
  { group: "Allocation", tab: "Allocation & Rebalance", label: "Allocation", icon: "target" },
  { group: "Risk", tab: "Risk Factors & Exposure", label: "Strategy Risk", icon: "risk" },
  { group: "Risk", tab: "Correlation & Diversification", label: "Correlation", icon: "layers" },
  { group: "Research", tab: "Backtesting & Research Lab", label: "Research Lab", icon: "shield" },
  { group: "Workflow", tab: "Strategy Library & Workflow", label: "Workflow", icon: "layers" },
  { group: "Reports", tab: "Daily Risk Report / Decision Log", label: "Daily Report", icon: "line" },
  { group: "Data", tab: "Market & Macro Monitor", label: "Market & Macro", icon: "activity" },
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
  return humanizeMetricLabel(factor, artifact);
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

let factoryDataReady = false;

function normalizeFactoryCatalog(payload) {
  if (!payload) return null;
  const dates = payload.shared_dates;
  const catalog = payload.factory_strategy_research || payload;
  if (dates && catalog?.results) {
    catalog.results.forEach((item) => {
      const series = item.backtest?.return_series;
      if (series && !series.dates?.length) series.dates = dates;
    });
  }
  return catalog?.results ? catalog : null;
}

function activateFactoryCatalog(catalog, artifact = activeArtifact) {
  if (!catalog?.results?.length) {
    factoryDataReady = false;
    return false;
  }
  factoryResearchCatalog = catalog;
  ResearchUniverse.hydrate(factoryResearchCatalog, artifact);
  mergedResearchResults = buildMergedResearchResults(artifact);
  factoryDataReady = true;
  return true;
}

function uiStrategies(artifact = activeArtifact) {
  if (typeof ResearchUniverse !== "undefined" && ResearchUniverse.isLegacyProxyMode()) {
    return artifact?.strategies || [];
  }
  if (factoryDataReady) return ResearchUniverse.strategyRows();
  return [];
}

function uiPortfolioSeries(artifact = activeArtifact) {
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode()) {
    const series = ResearchUniverse.portfolioSeries();
    if (series?.dates?.length) return series;
  }
  return portfolioSeriesForDisplay(artifact);
}

function renderResearchModeBanners() {
  const currentBanner = `<div class="research-context-banner"><strong>STRATEGY 21 RESEARCH ALLOCATION</strong> · NOT LIVE · NOT ALLOCATION APPROVED · Default C2A2_020 50% / C2B2_004 50%</div>`;
  const legacyBanner = `<div class="research-context-banner warning"><strong>LEGACY PROXY REFERENCE MODE</strong> · ETF proxy sandbox · Not current US-equity research portfolio</div>`;
  const isLegacy = typeof ResearchUniverse !== "undefined" && ResearchUniverse.isLegacyProxyMode();
  [
    "commandResearchBanner",
    "allocationResearchBanner",
    "factorResearchBanner",
    "correlationResearchBanner",
    "workflowResearchBanner",
    "dailyReportResearchBanner",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = isLegacy ? legacyBanner : currentBanner;
  });
  const legacyPanel = document.getElementById("legacyStrategyMonitorPanel");
  if (legacyPanel) legacyPanel.classList.toggle("hidden-panel", !isLegacy);
  const factorNote = document.getElementById("factorSectionNote");
  if (factorNote) {
    factorNote.textContent = isLegacy
      ? "Legacy ETF proxy factor loadings (research reference only). Not current US-equity strategy exposure."
      : "US-equity strategy risk factors from Strategy Factory baselines and Strategy 21 overlap diagnostics. Values are labeled MEASURED, PROXY, ECONOMIC INTERPRETATION, or NOT YET MEASURED.";
  }
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
  drawOperatingPeriodCharts(series);
  renderFactorExposureBars("portfolioFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorExposureBars("riskFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorNotes(artifact);
  if (selectedLiteratureItem?.backtest) renderResearchLabPanels(selectedLiteratureItem);
  document.querySelectorAll("[data-spark]").forEach((canvas) => {
    if (canvas.__sparkValues) drawSparkline(canvas, canvas.__sparkValues, canvas.__sparkColor || "#1ac8ff");
  });
}

function installChartObservers(artifact) {
  const targets = ["pnlCanvas", "drawdownCanvas", "backtestCanvas"];
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

async function renderShadowStrategyRegistry(status = "ALL_US_EQUITY") {
  const table = document.getElementById("shadowStrategyTable");
  if (!table) return;
  await ensureFactoryResearchExtension();
  ResearchUniverse.hydrate(factoryResearchCatalog, activeArtifact);
  if (status === "LEGACY_REFERENCE") {
    ResearchUniverse.setPortfolioViewMode("legacy");
    renderResearchModeBanners();
    renderTables(activeArtifact);
    return;
  }
  ResearchUniverse.setPortfolioViewMode("current");
  ResearchUniverse.setStrategyTableFilter(status);
  renderResearchModeBanners();
  if (!factoryDataReady) {
    table.innerHTML = "<tr><td colspan='12'>DATA UNAVAILABLE — US-equity research bundle not loaded.</td></tr>";
    return;
  }
  const rows = ResearchUniverse.filterStrategyRows(status);
  table.innerHTML = `<tr><th>ID</th><th>Name</th><th>Status</th><th>Gross</th><th>Net</th><th>Sharpe</th><th>Max DD</th><th>Turnover</th><th>Cost Drag</th><th>IC</th><th>Decile</th><th>Decision</th></tr>` +
    rows.map((row) => `<tr class="table-link-row" data-open-research-lab="${escapeHtml(row.strategy_id)}">
      <td>${escapeHtml(row.strategy_id)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${statusBadge(row.lifecycle_status || row.research_group)}</td>
      <td>${row.gross_return == null ? "N/A" : pct(row.gross_return, 1)}</td>
      <td>${row.net_return == null ? "N/A" : pct(row.net_return, 1)}</td>
      <td>${row.sharpe == null ? "N/A" : num(row.sharpe, 3)}</td>
      <td>${row.max_drawdown == null ? "N/A" : pct(row.max_drawdown, 1)}</td>
      <td>${row.turnover == null ? "N/A" : num(row.turnover, 3)}</td>
      <td>${row.transaction_cost_drag == null ? "N/A" : pct(row.transaction_cost_drag, 2)}</td>
      <td>${row.ic == null ? "N/A" : num(row.ic, 4)}</td>
      <td>${row.decile_spread == null ? "N/A" : num(row.decile_spread, 5)}</td>
      <td class="wrap-cell">${escapeHtml(row.status_reason || row.recommended_action || "Review")}</td>
    </tr>`).join("") ||
    "<tr><td colspan='12'>No strategies match this filter.</td></tr>";
  table.querySelectorAll("[data-open-research-lab]").forEach((row) => {
    row.addEventListener("click", () => openResearchLabForStrategy(row.dataset.openResearchLab));
  });
}

function mergeLiveOverlay(artifact, overlay) {
  if (!overlay) return artifact;
  artifact.live_data_mode = overlay.data_mode || artifact.live_data_mode || "artifact_static";
  artifact.market_monitor = overlay.market_monitor || artifact.market_monitor;
  artifact.news_risk = overlay.news_risk || artifact.news_risk;
  artifact.recommendations = overlay.recommendations || artifact.recommendations;
  artifact.live_refreshed_at = overlay.refreshed_at;
  artifact.live_market_as_of = overlay.market_as_of;
  artifact.intraday_snapshot_id = overlay.snapshot_id || artifact.intraday_snapshot_id;
  if (overlay.intraday_marks) mergeIntradayMarks(artifact, overlay.intraday_marks);
  if (overlay.factor_exposure_current) {
    artifact.factors = artifact.factors || {};
    artifact.factors.portfolio_factor_exposure_current = overlay.factor_exposure_current;
  }
  return artifact;
}

function mergeIntradayMarks(artifact, marks) {
  if (!marks) return artifact;
  artifact.intraday_marks = marks;
  artifact.intraday_snapshot_id = marks.snapshot_id || artifact.intraday_snapshot_id;
  artifact.intraday_refresh_status = {
    data_freshness: marks.data_quality?.freshness,
    latest_observation: marks.data_quality?.latest_observation_ts_et,
    refreshed_at: marks.refreshed_at,
    evaluation_metadata: marks.evaluation_metadata,
  };
  if (marks.market_monitor) artifact.market_monitor = marks.market_monitor;
  if (marks.news_risk) artifact.news_risk = marks.news_risk;
  if (marks.recommendations) artifact.recommendations = marks.recommendations;
  if (marks.data_quality) {
    artifact.data_quality = { ...(artifact.data_quality || {}), intraday: marks.data_quality };
  }
  return artifact;
}

function mergeIntradaySnapshot(artifact, snapshot) {
  if (!snapshot?.marks) return artifact;
  mergeIntradayMarks(artifact, snapshot.marks);
  artifact.intraday_snapshot_id = snapshot.snapshot_id;
  artifact.intraday_refresh_status = {
    ...(artifact.intraday_refresh_status || {}),
    snapshot_id: snapshot.snapshot_id,
    refresh_completed_at: snapshot.refresh_completed_at,
    latest_observation: snapshot.latest_observation_ts_et,
    market_status: snapshot.market_session_status,
    refresh_status: snapshot.refresh_status,
    ticker_count_requested: snapshot.ticker_count_requested,
    ticker_count_successful: snapshot.ticker_count_successful,
    failed_ticker_count: (snapshot.missing_tickers || []).length,
    missing_tickers: snapshot.missing_tickers || [],
    shadow_intraday: snapshot.shadow_intraday,
    intraday_data_label: snapshot.intraday_data_label,
  };
  return artifact;
}

function renderLiveDataState(artifact) {
  renderIntradayRefreshStrip(artifact);
  renderTruthDisclosure(artifact);
}

function renderIntradayRefreshStrip(artifact) {
  const strip = document.getElementById("intradayRefreshStrip");
  if (!strip) return;
  const monitoring = formatMonitoringState(artifact);
  const status = artifact.intraday_refresh_status || {};
  const meta = artifact.build_metadata || {};
  const marketAsOf = meta.market_as_of || artifact.as_of_date;
  const cadence = status.selected_cadence_minutes || status.refresh_cadence_minutes || selectedIntradayCadence || 5;
  const lastRefresh = status.last_successful_refresh_at || status.refresh_completed_at || artifact.live_refreshed_at;
  const latestBar = status.latest_completed_market_bar_at || status.latest_market_observation_at || status.latest_observation || artifact.live_market_as_of;
  const nextRefresh = status.next_scheduled_refresh_at;
  const schedulerState = status.scheduler_state || status.refresh_state || monitoring.schedulerLabel || "idle";
  const freshness = status.data_freshness || status.canonical_data_state || monitoring.stripDataState;
  const schedulerDisplay = status.scheduler_display || status.scheduler_label || monitoring.schedulerLabel || schedulerState;
  const requested = status.ticker_count_requested;
  const successful = status.ticker_count_successful;
  const failed = status.failed_ticker_count ?? ((status.missing_tickers || []).length);
  const shadowRows = status.shadow_intraday?.strategies || artifact.intraday_marks?.shadow_intraday?.strategies || [];
  const compositeShadow = shadowRows.find((row) => row.strategy_id === "STRATEGY_21_RESEARCH_COMPOSITE_V1");
  const incomplete = shadowRows.filter((row) => row.available === false);
  const coverageWarning = incomplete.length
    ? `<span class="negative">Incomplete <strong>${incomplete.map((row) => `${escapeHtml(row.strategy_id)}: ${(row.missing_tickers || []).join(", ") || "no valid marks"}; uncovered ${pct(row.uncovered_gross_weight || 0, 2)}`).join(" | ")}</strong></span>`
    : "";
  const warning = status.last_error ? `<span class="negative">Refresh warning <strong>${escapeHtml(status.last_error)}</strong></span>` : "";
  strip.innerHTML = `
    <span>Market <strong>${monitoring.headerMarket}</strong></span>
    <span>Monitoring <strong class="${monitoring.tone || ""}">${monitoring.stripMonitoring}</strong></span>
    <span>Cadence <strong>${cadence}m</strong></span>
    <span>Scheduler <strong>${escapeHtml(String(schedulerDisplay))}</strong></span>
    <span>Freshness <strong class="${monitoring.tone || ""}">${escapeHtml(String(freshness))}</strong></span>
    <span>Last refresh <strong>${formatTimestamp(lastRefresh)}</strong></span>
    <span>Latest bar <strong>${formatTimestamp(latestBar)}</strong></span>
    <span>Next refresh <strong>${formatTimestamp(nextRefresh)}</strong></span>
    <span>Coverage <strong>${successful ?? "n/a"}/${requested ?? "n/a"}</strong></span>
    <span>Failed <strong>${failed ?? "n/a"}</strong></span>
    <span>Shadow PnL <strong>${compositeShadow?.estimated_pnl == null ? "n/a" : money(compositeShadow.estimated_pnl)}</strong></span>
    <span>Label <strong>INTRADAY_SHADOW_ESTIMATE · delayed/best-effort</strong></span>
    ${warning}
    ${coverageWarning}
    <span class="muted-copy">${monitoring.detail} · Snapshot ${artifact.intraday_snapshot_id || status.snapshot_id || "daily artifact"} · Proxy as-of ${marketAsOf}</span>`;
}

function formatTimestamp(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
}

function renderNewsRiskSummary(newsRisk = {}) {
  const el = document.getElementById("newsRiskSummary");
  if (!el) return;
  const items = newsRisk.items || [];
  const material = items.filter((item) => item.human_review || ["high", "medium"].includes(String(item.severity || "").toLowerCase()));
  const urgent = material.length > 0 && material.some((item) => item.portfolio_mapped || item.affected_strategies?.length);
  const watch = urgent ? "urgent review" : items.length ? "monitor" : "normal";
  const sourceLabel = newsRisk.source?.includes("fallback") || newsRisk.source?.includes("proxy")
    ? "Sample / proxy headline feed"
    : (newsRisk.source || "yfinance / market-move proxy");
  el.innerHTML = `
    <p>${statusBadge(watch)} News risk score <strong>${newsRisk.news_risk_score || 0}</strong> · ${items.length} headline(s) · ${escapeHtml(sourceLabel)}</p>
    ${items.slice(0, 3).map((item) => `<p><strong>${escapeHtml(item.headline)}</strong><br><span class="muted-copy">${escapeHtml(item.risk_interpretation || item.topic || "")}</span></p>`).join("") || "<p class='empty-state'>No live news items loaded.</p>"}`;
}

function renderRecommendationPanels(recs = [], artifact = activeArtifact) {
  const recHtml = recs.map((rec) => `<p>${statusBadge(rec.priority)} <strong>${escapeHtml(humanizeUserFacingText(rec.action, artifact))}</strong><br>${escapeHtml(humanizeUserFacingText(rec.rationale, artifact))}</p>`).join("") || emptyState("No recommendations.");
  const list = document.getElementById("recommendationList");
  if (list) list.innerHTML = recHtml;
  const reportList = document.getElementById("reportRecommendationList");
  if (reportList) reportList.innerHTML = recHtml;
}

async function refreshLiveDataFromServer(artifact) {
  const button = document.getElementById("refreshLiveData");
  if (button) {
    button.disabled = true;
    button.textContent = "Refreshing proxy data…";
  }
  renderIntradayRefreshStrip({ ...artifact, intraday_refresh_status: { ...(artifact.intraday_refresh_status || {}), refresh_state: "refreshing", in_progress: true, scheduler_state: "refreshing" } });
  try {
    const response = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval_minutes: selectedIntradayCadence }),
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "refresh failed");
    mergeLiveOverlay(artifact, payload);
    if (payload.snapshot_id) artifact.intraday_snapshot_id = payload.snapshot_id;
    applyIntradayUiRefresh(artifact);
    if (button) button.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (button) button.textContent = "Refresh failed";
    const strip = document.getElementById("intradayRefreshStrip");
    if (strip) strip.insertAdjacentHTML("beforeend", `<span class="negative">Error: ${escapeHtml(error.message)}</span>`);
  } finally {
    if (button) button.disabled = false;
  }
}

function applyIntradayUiRefresh(artifact) {
  renderTopHeader(artifact);
  renderLiveDataState(artifact);
  renderNewsRiskSummary(artifact.news_risk);
  renderRecommendationPanels(artifact.recommendations);
  renderKpis(artifact);
  renderStaticTables(artifact);
  redrawAllCharts(artifact);
}

let intradayPollTimer = null;
let lastSeenSnapshotId = null;
let selectedIntradayCadence = 5;

function syncCadenceSelector(minutes) {
  selectedIntradayCadence = Number(minutes) || 5;
  const select = document.getElementById("intradayCadenceSelect");
  if (select && String(select.value) !== String(selectedIntradayCadence)) {
    select.value = String(selectedIntradayCadence);
  }
}

async function setIntradayCadence(minutes, artifact) {
  syncCadenceSelector(minutes);
  try {
    const response = await fetch("/api/refresh/cadence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval_minutes: selectedIntradayCadence }),
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "cadence update failed");
    artifact.intraday_refresh_status = { ...(artifact.intraday_refresh_status || {}), ...payload };
    renderIntradayRefreshStrip(artifact);
    renderTopHeader(artifact);
  } catch (error) {
    const strip = document.getElementById("intradayRefreshStrip");
    if (strip) strip.insertAdjacentHTML("beforeend", `<span class="negative">Cadence error: ${escapeHtml(error.message)}</span>`);
  }
}

async function pollIntradayRefreshStatus(artifact) {
  try {
    const response = await fetch(`/api/refresh/status?interval_minutes=${selectedIntradayCadence}`, { cache: "no-store" });
    if (!response.ok) throw new Error("status unavailable");
    const status = await response.json();
    intradayMonitoringOffline = false;
    setWorkstationMonitoring(true, false);
    syncCadenceSelector(status.selected_cadence_minutes || status.refresh_cadence_minutes || selectedIntradayCadence);
    artifact.intraday_refresh_status = { ...(artifact.intraday_refresh_status || {}), ...status, monitoring_offline: false, ok: true };
    renderIntradayRefreshStrip(artifact);
    renderTopHeader(artifact);
    const snapshotId = status.snapshot_id;
    if (snapshotId && snapshotId !== lastSeenSnapshotId) {
      const snapResponse = await fetch("/api/snapshot/latest", { cache: "no-store" });
      if (snapResponse.ok) {
        const snapshot = await snapResponse.json();
        if (snapshot.ok !== false) {
          mergeIntradaySnapshot(artifact, snapshot);
          lastSeenSnapshotId = snapshotId;
          applyIntradayUiRefresh(artifact);
        }
      }
    }
  } catch {
    intradayMonitoringOffline = true;
    setWorkstationMonitoring(false, false);
    artifact.intraday_refresh_status = {
      ...(artifact.intraday_refresh_status || {}),
      monitoring_offline: true,
      ok: false,
    };
    renderIntradayRefreshStrip(artifact);
    renderTopHeader(artifact);
  }
}

function installIntradayPolling(artifact) {
  if (intradayPollTimer) clearInterval(intradayPollTimer);
  lastSeenSnapshotId = artifact.intraday_snapshot_id || null;
  syncCadenceSelector(artifact.intraday_refresh_status?.selected_cadence_minutes || artifact.intraday_refresh_status?.refresh_cadence_minutes || 5);
  pollIntradayRefreshStatus(artifact);
  intradayPollTimer = setInterval(() => pollIntradayRefreshStatus(artifact), 45_000);
}

function installLiveControls(artifact) {
  const button = document.getElementById("refreshLiveData");
  const cadenceSelect = document.getElementById("intradayCadenceSelect");
  if (cadenceSelect) {
    cadenceSelect.addEventListener("change", () => setIntradayCadence(cadenceSelect.value, artifact));
  }
  if (!button) return;
  button.addEventListener("click", () => refreshLiveDataFromServer(artifact));
}

let riskActionFilter = "current_model";
let reportFrozenAt = null;
let intradayMonitoringOffline = false;
let activeArtifact = null;
let activeDrawerView = "overview";
const proposalSession = {
  weights: {},
  simulation: null,
  source: "current",
};

function initProposalSession(artifact) {
  if (factoryDataReady) {
    proposalSession.weights = ResearchUniverse.defaultResearchWeights();
  } else if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode()) {
    proposalSession.weights = {};
  } else {
    proposalSession.weights = Object.fromEntries(
      (artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.current_weight || 0]),
    );
  }
  proposalSession.simulation = null;
  proposalSession.source = "current";
}

function loadSystemProposalSession(artifact) {
  if (factoryDataReady) {
    proposalSession.weights = ResearchUniverse.defaultResearchWeights();
  } else if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode()) {
    proposalSession.weights = {};
  } else {
    proposalSession.weights = Object.fromEntries(
      (artifact.strategies || []).map((strategy) => [strategy.strategy_id, strategy.proposed_weight || 0]),
    );
  }
  proposalSession.simulation = null;
  proposalSession.source = "system";
}

function renderLegacyAllocationReference(artifact) {
  const table = document.getElementById("legacyAllocationReferenceTable");
  if (!table) return;
  table.innerHTML = "<tr><th>Legacy ETF Proxy</th><th>Current Weight</th></tr>" +
    (artifact.strategies || []).filter((row) => (row.current_weight || 0) > 0).map((row) =>
      `<tr><td>${escapeHtml(row.name)}</td><td>${pct(row.current_weight || 0, 1)}</td></tr>`).join("") ||
    "<tr><td colspan='2'>No legacy proxy allocation loaded.</td></tr>";
}

function invalidateProposalSimulation() {
  proposalSession.simulation = null;
}

function sessionProposedWeight(strategyId, fallback = 0) {
  return proposalSession.weights[strategyId] ?? fallback;
}

function refreshProposalStatusViews(artifact) {
  renderAllocationEditor(artifact);
  renderSimulationResult(artifact);
  renderAllocationBeforeAfterStrip(artifact);
  renderApprovalStatusBar(artifact);
  renderAllocationAnalysisPanels(artifact);
  renderAllocationPersistentChecks(artifact);
  renderDecisionStatusLines(artifact);
  renderRebalancePreview(artifact);
  renderDailyReport(artifact);
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  const statusEl = document.getElementById("decisionAuthorityStatus");
  if (statusEl) {
    if (proposal.status === "No rebalance proposed") {
      statusEl.textContent = "No allocation change from current weights. Simulation not required.";
    } else if (proposal.status === "Simulation required") {
      statusEl.textContent = "Proposed weights differ from current allocation. Run simulation before recording a decision.";
    } else if (!proposalSession.simulation) {
      statusEl.textContent = "Human approval does not authorize execution. Simulate proposal before recording a decision.";
    }
  }
}

async function probeWorkstationApi() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    setWorkstationMonitoring(response.ok, false);
    return response.ok;
  } catch {
    setWorkstationMonitoring(false, true);
    return false;
  }
}

let localDecisionEvents = [];
let monitorSort = { key: "daily_pnl", direction: "desc" };
let simulationApiAvailable = null;
let selectedLiteratureItem = null;
let factoryResearchCatalog = null;
let mergedResearchResults = [];
let factoryResearchPromise = null;
const DEFAULT_RESEARCH_STRATEGY_ID = "C2A2_020";
const RESEARCH_GROUP_LABELS = {
  CURRENT_US_EQUITY_RESEARCH: "Current US-Equity Research",
  ARCHIVED_US_EQUITY_RESEARCH: "Archived / Rejected US-Equity Research",
  STRATEGY_21: "Strategy 21",
  LEGACY_PROXY: "Research Reference / Legacy Proxy",
};
let correlationUniverse = "CURRENT_COMPOSITE";

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
  const candidates = [
    "/api/artifact/bootstrap",
    "/output/dashboard_artifact.json",
    "../output/dashboard_artifact.json",
  ];
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

let researchExtensionPromise = null;

async function fetchFactoryResearchExtension() {
  const candidates = ["/dashboard/data/us_equity_research_bundle.json", "/api/artifact/factory-research"];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      continue;
    }
  }
  return null;
}

async function ensureFactoryResearchExtension() {
  if (factoryResearchCatalog?.results?.length) return factoryResearchCatalog;
  if (!factoryResearchPromise) factoryResearchPromise = fetchFactoryResearchExtension();
  const extension = await factoryResearchPromise;
  activateFactoryCatalog(normalizeFactoryCatalog(extension), activeArtifact);
  return factoryResearchCatalog;
}

function buildMergedResearchResults(artifact = activeArtifact) {
  const factoryResults = (factoryResearchCatalog?.results || []).map((item, index) => ({
    ...item,
    _index: index,
    research_group: item.research_group || item.backtest?.research_group,
    strategy_id: item.strategy_id || item.backtest?.strategy_id,
  }));
  const literature = artifact?.literature_strategy_backtests?.results || [];
  const literatureStart = factoryResults.length;
  const legacyResults = literature.map((item, offset) => ({
    ...item,
    _index: literatureStart + offset,
    research_group: "LEGACY_PROXY",
    strategy_id: item.backtest?.strategy_id || item.backtest?.name,
  }));
  return [...factoryResults, ...legacyResults];
}

function findResearchLabItem(strategyId) {
  return mergedResearchResults.find((item) => item.strategy_id === strategyId || item.backtest?.strategy_id === strategyId) || null;
}

function openResearchLabForStrategy(strategyId) {
  const item = findResearchLabItem(strategyId);
  if (!item) return false;
  renderResearchLabPanels(item);
  setActiveTab("Backtesting & Research Lab");
  return true;
}

async function fetchResearchExtension() {
  const candidates = ["/api/artifact/research", "/output/literature_strategy_backtests.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json();
      if (path.includes("literature_strategy_backtests")) {
        return { literature_strategy_backtests: payload };
      }
      return payload;
    } catch {
      continue;
    }
  }
  return null;
}

async function ensureResearchExtension(artifact = activeArtifact) {
  if (!artifact) return artifact;
  const literature = artifact.literature_strategy_backtests || {};
  if ((literature.results || []).length) return artifact;
  if (!literature.lazy_load && !literature.results_count) return artifact;
  if (!researchExtensionPromise) researchExtensionPromise = fetchResearchExtension();
  const extension = await researchExtensionPromise;
  if (extension?.literature_strategy_backtests) {
    artifact.literature_strategy_backtests = extension.literature_strategy_backtests;
  }
  return artifact;
}

function mergeStrategyDetail(strategy, detail) {
  if (!strategy || !detail) return strategy;
  if (detail.position_packet) strategy.position_packet = detail.position_packet;
  if (detail.risk_packet?.chart_series) {
    strategy.risk_packet = { ...(strategy.risk_packet || {}), chart_series: detail.risk_packet.chart_series };
  }
  return strategy;
}

async function ensureStrategyDetail(strategy, artifact = activeArtifact) {
  if (!strategy) return strategy;
  if (strategy.position_packet || strategy.risk_packet?.chart_series) return strategy;
  try {
    const response = await fetch(
      `/api/artifact/strategy-detail?strategy_id=${encodeURIComponent(strategy.strategy_id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return strategy;
    const detail = await response.json();
    if (detail.ok === false) return strategy;
    mergeStrategyDetail(strategy, detail);
    const index = (artifact?.strategies || []).findIndex((row) => row.strategy_id === strategy.strategy_id);
    if (index >= 0) mergeStrategyDetail(artifact.strategies[index], detail);
  } catch {
    return strategy;
  }
  return strategy;
}

function refreshResearchLabViews(artifact = activeArtifact) {
  if (!artifact) return;
  mergedResearchResults = buildMergedResearchResults(artifact);
  renderLiteratureStrategies(artifact.literature_strategy_backtests || {}, mergedResearchResults);
  populateResearchLabSelector(artifact);
  const defaultItem = findResearchLabItem(DEFAULT_RESEARCH_STRATEGY_ID) || mergedResearchResults[0];
  if (defaultItem) renderResearchLabPanels(defaultItem);
}

function scheduleSecondaryRender(artifact) {
  const run = () => {
    renderHistoricalResearchContext(artifact);
    renderRiskSidebar(artifact);
    renderCardsAndMatrices(artifact);
    renderStaticTables(artifact);
    renderWorkflow(artifact);
    populateResearchLabSelector(artifact);
    installIntradayPolling(artifact);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    requestAnimationFrame(run);
  }
}

function scheduleResearchExtensionLoad(artifact) {
  void Promise.all([ensureResearchExtension(artifact), ensureFactoryResearchExtension()]).then(([updated]) => {
    if (!updated) return;
    activeArtifact = updated;
    ResearchUniverse.hydrate(factoryResearchCatalog, updated);
    renderResearchModeBanners();
    refreshResearchLabViews(updated);
    renderTables(updated);
    renderWorkstationPanels(updated);
    renderCardsAndMatrices(updated);
    renderWorkflow(updated);
    renderDailyReport(updated);
    refreshProposalStatusViews(updated);
  });
}

function setActiveTab(tab) {
  document.querySelectorAll(".nav-rail button[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === tab);
  });
  if (tab === "Daily Risk Report / Decision Log" && activeArtifact) {
    renderDailyReport(activeArtifact);
  }
  if (tab === "Backtesting & Research Lab" && activeArtifact) {
    void Promise.all([ensureResearchExtension(activeArtifact), ensureFactoryResearchExtension()]).then(([updated]) => {
      activeArtifact = updated;
      refreshResearchLabViews(updated);
    });
  }
  requestAnimationFrame(() => redrawAllCharts(activeArtifact));
}

function renderLeftNav() {
  const nav = document.getElementById("navRail");
  if (!nav) return;
  let html = "";
  let lastGroup = "";
  NAV_SECTIONS.forEach((item, index) => {
    if (item.group !== lastGroup) {
      html += `<div class="nav-group-label">${item.group}</div>`;
      lastGroup = item.group;
    }
    html += `<button type="button" class="${index === 0 ? "active" : ""}" data-tab="${item.tab}" title="${item.tab}">${icon(item.icon)}<span>${item.label}</span></button>`;
  });
  nav.innerHTML = html;
  nav.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));
  installShellControls();
}

function renderTopHeader(artifact = activeArtifact) {
  const el = document.getElementById("topbarMeta");
  if (!el || !artifact) return;
  const monitoring = formatMonitoringState(artifact);
  el.innerHTML = `
    <span class="mode-badge">Prototype Model Portfolio</span>
    <span>As-of <strong>${artifact.as_of_date || "n/a"}</strong></span>
    <span>Initial Model Capital <strong>${money(artifact.initial_capital || 0)}</strong></span>
    <span>Monitored <strong>${artifact.strategy_count || 0}</strong></span>
    <span>Market <strong>${monitoring.headerMarket}</strong></span>
    <span>Data <strong class="${monitoring.tone || ""}">${monitoring.headerData}</strong></span>`;
  renderSecondaryStatusStrip(artifact);
}

function renderSecondaryStatusStrip(artifact, meta = artifact?.build_metadata || {}, marketAsOf = meta.market_as_of || artifact?.as_of_date) {
  const el = document.getElementById("secondaryStatusStrip");
  if (!el) return;
  const monitoring = formatMonitoringState(artifact);
  const disclosure = artifact?.data_classification?.disclosure || "Prototype · ETF proxy · Not live fills";
  el.innerHTML = `
    <span title="${escapeHtml(disclosure)}">Build ${meta.build_id || "n/a"}</span>
    <span>Retrieved ${meta.data_retrieved_at || meta.artifact_generated_at || "n/a"}</span>
    <span>Operating since ${investmentStart(artifact)}</span>
    <span>${monitoring.stripMonitoring} · ${monitoring.stripDataState}</span>
    <span>Proxy as-of ${marketAsOf}</span>
    <span>${disclosure.length > 90 ? `${disclosure.slice(0, 87)}…` : disclosure}</span>`;
}

function renderGlobalStatusBar() {
  /* V2: metadata moved to topbar + secondary strip */
}

function installShellControls() {
  const drawer = document.getElementById("riskDrawer");
  document.getElementById("toggleRiskDrawer")?.addEventListener("click", () => {
    drawer?.classList.toggle("collapsed");
  });
}

function renderHistoricalResearchContext(artifact = activeArtifact) {
  const el = document.getElementById("historicalResearchContext");
  if (!el || !artifact) return;
  const usingResearch = typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length;
  if (usingResearch) {
    const composite = ResearchUniverse.compositeItem()?.backtest || {};
    el.innerHTML = `
      <div class="research-context-banner">
        <strong>Strategy 21 historical research context (not live PnL)</strong>
        <span>Net return ${composite.net_metrics?.cumulative_return == null ? "N/A" : pct(composite.net_metrics.cumulative_return, 1)} · Sharpe ${composite.net_metrics?.sharpe == null ? "N/A" : num(composite.net_metrics.sharpe, 2)} · Max DD ${composite.net_metrics?.max_drawdown == null ? "N/A" : pct(composite.net_metrics.max_drawdown, 1)} · Members C2A2_020 50% / C2B2_004 50%</span>
        <span class="status-muted">NOT LIVE · NOT ALLOCATION APPROVED · Pilot 500 survivorship-biased universe</span>
      </div>`;
    return;
  }
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
  renderLeftNav();
}

function renderAllocationBars(strategies = []) {
  const el = document.getElementById("allocationBars");
  if (!el) return;
  const allocated = strategies.filter((strategy) => (strategy.current_weight || 0) > 0)
    .sort((left, right) => (right.current_weight || 0) - (left.current_weight || 0));
  const maxWeight = Math.max(...allocated.map((strategy) => strategy.current_weight || 0), 0.01);
  el.innerHTML = allocated.slice(0, 10).map((strategy) => `
    <div class="allocation-bar-row">
      <span>${strategy.name}</span>
      <div class="allocation-bar-track"><span class="allocation-bar-fill" style="width:${Math.min(100, (strategy.current_weight / maxWeight) * 100)}%"></span></div>
      <strong class="col-pct">${pct(strategy.current_weight || 0)}</strong>
    </div>`).join("") || "<p class='empty-state'>No allocated strategies.</p>";
}

function strategyRationale(strategy) {
  const review = strategy.decision_review || {};
  const gate = strategy.correlation_gate || {};
  if (review.summary) return review.summary;
  if (gate.interpretation) return gate.interpretation;
  if (strategy.allocation_eligibility?.summary) return strategy.allocation_eligibility.summary;
  return strategy.hypothesis || "Monitor daily behavior versus hypothesis and limits.";
}

function strategyActionLabel(strategy, proposedWeight = strategy.proposed_weight) {
  const action = strategy.final_action_after_double_check || strategy.recommended_action || "Review";
  const change = (proposedWeight ?? strategy.proposed_weight ?? 0) - (strategy.current_weight || 0);
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
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length) {
    const composite = ResearchUniverse.compositeItem()?.backtest || {};
    const weights = ResearchUniverse.defaultResearchWeights();
    el.innerHTML = `<tr><th>Strategy 21 Member</th><th>Research Weight</th><th>Status</th><th>Net Return</th><th>Sharpe</th><th>Action</th></tr>` +
      Object.entries(weights).filter(([, weight]) => weight > 0).map(([strategyId, weight]) => {
        const row = ResearchUniverse.itemById(strategyId);
        const backtest = row?.backtest || {};
        return `<tr>
          <td><button class="table-link" data-open-research-lab="${strategyId}"><strong>${escapeHtml(backtest.name || strategyId)}</strong></button></td>
          <td class="col-pct">${pct(weight, 0)}</td>
          <td class="col-status">${statusBadge("research only")}</td>
          <td>${backtest.net_metrics?.cumulative_return == null ? "N/A" : pct(backtest.net_metrics.cumulative_return, 1)}</td>
          <td>${backtest.net_metrics?.sharpe == null ? "N/A" : num(backtest.net_metrics.sharpe, 3)}</td>
          <td class="wrap-cell">Research composite member · not allocation approved</td>
        </tr>`;
      }).join("") +
      `<tr><td><strong>Strategy 21 Composite</strong></td><td class="col-pct">100%</td><td class="col-status">${statusBadge(composite.lifecycle_status || "research composite")}</td><td>${composite.net_metrics?.cumulative_return == null ? "N/A" : pct(composite.net_metrics.cumulative_return, 1)}</td><td>${composite.net_metrics?.sharpe == null ? "N/A" : num(composite.net_metrics.sharpe, 3)}</td><td class="wrap-cell">NOT LIVE · NOT ALLOCATION APPROVED</td></tr>`;
    el.querySelectorAll("[data-open-research-lab]").forEach((button) => button.addEventListener("click", () => openResearchLabForStrategy(button.dataset.openResearchLab)));
    return;
  }
  const rows = (artifact.strategies || []).filter((strategy) => {
    const proposed = sessionProposedWeight(strategy.strategy_id, strategy.proposed_weight || 0);
    return (strategy.current_weight || 0) > 0 || proposed > 0;
  });
  el.innerHTML = `<tr><th>Strategy</th><th>Current</th><th>Proposed</th><th>Change</th><th>Risk Impact</th><th>Est. Cost</th><th>Action</th><th>Gate</th><th>Human</th></tr>` +
    rows.map((strategy) => {
      const proposed = sessionProposedWeight(strategy.strategy_id, strategy.proposed_weight || 0);
      const change = proposed - (strategy.current_weight || 0);
      const cost = Math.abs(change) * artifact.initial_capital * 0.0005;
      const gate = proposalSession.simulation?.checks?.find((c) => c.status === "breach")
        || strategy.decision_review?.checks?.find((c) => c.status === "breach");
      return `<tr>
        <td><button class="table-link" data-open-strategy="${strategy.strategy_id}"><strong>${strategy.name}</strong></button></td>
        <td class="col-pct">${pct(strategy.current_weight || 0, 1)}</td>
        <td class="col-pct">${pct(proposed, 1)}</td>
        <td class="${cls(change)} col-pct">${pct(change, 1)}</td>
        <td class="wrap-cell">${proposalSession.simulation ? "See Allocation simulation" : "Simulation required for impact"}</td>
        <td class="col-num">${money(cost)}</td>
        <td class="col-status">${statusBadge(strategyActionLabel(strategy, proposed))}</td>
        <td class="col-status">${statusBadge(gate ? "blocked" : "clear")}</td>
        <td class="col-status">${statusBadge(strategy.human_approval_required ? "required" : "n/a")}</td>
      </tr>`;
    }).join("");
  el.querySelectorAll("[data-open-strategy]").forEach((button) => button.addEventListener("click", () => {
    setActiveTab("Allocation & Rebalance");
    openStrategyReview(artifact.strategies.find((strategy) => strategy.strategy_id === button.dataset.openStrategy), artifact);
  }));
}

function canonicalNonOkChecks(artifact = activeArtifact, filter = "current_model") {
  return groupedCanonicalIssues(artifact, filter === "all" ? "all" : filter);
}

function renderCommandRiskLimits(artifact) {
  const el = document.getElementById("commandRiskLimitsTable");
  if (!el) return;
  const checks = canonicalNonOkChecks(artifact).slice(0, 10);
  el.innerHTML = `<tr><th>Subject</th><th>Metric</th><th>Current</th><th>Limit</th><th>Util.</th><th>Status</th></tr>` +
    checks.map((check) => `<tr>
      <td class="wrap-cell">${escapeHtml(formatIssueSubjectLabel(check, artifact))}</td>
      <td>${humanizeMetricLabel(check.metric, artifact)}</td>
      <td>${typeof check.current_value === "number" ? num(check.current_value, 3) : humanize(check.current_value)}</td>
      <td>${typeof check.breach_threshold === "number" ? num(check.breach_threshold, 3) : humanize(check.breach_threshold)}</td>
      <td>${check.utilization != null ? pct(check.utilization, 0) : "—"}</td>
      <td>${statusBadge(check.status)}</td>
    </tr>`).join("") || `<tr><td colspan="6">All configured limits within range on allocated scope.</td></tr>`;
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
  el.innerHTML = `<tr><th>Proxy</th><th>Last</th><th>Daily</th><th class="interpretation-cell">Read</th></tr>` +
    (artifact.market_monitor || []).slice(0, 6).map((row) => `<tr>
      <td>${row.ticker}</td>
      <td class="col-num">${Number(row.last || 0).toFixed(2)}</td>
      <td class="col-pct ${cls(row.daily_return || 0)}">${pct(row.daily_return || 0, 2)}</td>
      <td class="interpretation-cell wrap-cell">${row.risk_interpretation}</td>
    </tr>`).join("");
}

function renderMonitorKpiStrip(artifact) {
  const el = document.getElementById("monitorKpiStrip");
  if (!el) return;
  const strategies = uiStrategies(artifact);
  const allocated = strategies.filter((strategy) => strategy.current_weight > 0);
  const retained = strategies.filter((strategy) => strategy.research_group === "RETAINED").length;
  const composite = strategies.some((strategy) => strategy.strategy_id === "STRATEGY_21_RESEARCH_COMPOSITE_V1") ? 1 : 0;
  el.innerHTML = compactKpiStrip([
    ["US-Equity Strategies", strategies.length, "Factory + Strategy 21", ""],
    ["Retained", retained, "Research composite members", ""],
    ["Strategy 21", composite, "Research composite", ""],
    ["Research Weight", "50% / 50%", "C2A2_020 / C2B2_004", ""],
    ["Allocation Approved", "No", "NOT LIVE", "warning-text"],
  ]);
}

function renderMonitorKpiGrid(artifact) {
  renderMonitorKpiStrip(artifact);
}

function renderUsEquityFactorCards(artifact = activeArtifact) {
  const el = document.getElementById("usEquityFactorCards");
  if (!el) return;
  if (typeof ResearchUniverse === "undefined" || ResearchUniverse.isLegacyProxyMode()) {
    el.innerHTML = "";
    return;
  }
  const cards = ResearchUniverse.factorCards();
  el.innerHTML = cards.map((card) => `<p><span class="badge warning">${escapeHtml(card.kind || "INTERPRETATION")}</span> <strong>${escapeHtml(card.strategy_name || card.strategy_id)} · ${escapeHtml(card.label || "Factor")}:</strong> ${escapeHtml(card.detail || "NOT AVAILABLE IN CURRENT BASELINE")}</p>`).join("")
    || `<p class="status-muted">NOT AVAILABLE IN CURRENT BASELINE</p>`;
  const matrix = document.getElementById("factorMatrix");
  if (matrix?.parentElement?.parentElement) {
    matrix.parentElement.parentElement.classList.toggle("hidden-panel", true);
  }
}

function renderFactorKpiGrid(artifact) {
  const el = document.getElementById("factorKpiGrid");
  if (!el) return;
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length) {
    const cards = ResearchUniverse.factorCards();
    el.innerHTML = cards.slice(0, 12).map((card) => `<article class="kpi-card factor-proxy-card">
      <span>${escapeHtml(card.strategy_name || card.strategy_id)} · ${escapeHtml(card.label || "Factor")}</span>
      <strong>${escapeHtml(card.kind || "INTERPRETATION")}</strong>
      <small>${escapeHtml(card.detail || "NOT AVAILABLE IN CURRENT BASELINE")}</small>
    </article>`).join("") || `<article class="kpi-card factor-proxy-card"><span>US-Equity Strategy Risk Factors</span><strong>Pending</strong><small>Factory artifacts loading</small></article>`;
    renderUsEquityFactorCards(artifact);
    return;
  }
  const exposureMap = artifact.factors?.portfolio_factor_exposure_current || {};
  const primaryMetrics = ["equity_beta", "credit_spread", "rates_duration", "usd_fx", "commodity_beta", "volatility"];
  const checksByMetric = Object.fromEntries((artifact.risk_limits?.factors?.checks || []).map((check) => [check.metric, check]));
  const checks = primaryMetrics.map((metric) => checksByMetric[metric]).filter(Boolean);
  if (!checks.length) {
    el.innerHTML = `<article class="kpi-card factor-proxy-card"><span>Proxy Factor Loadings</span><strong>Normal</strong><small>No active proxy factor limit breaches</small></article>`;
    return;
  }
  el.innerHTML = checks.map((check) => {
    const card = formatFactorLimitCard(check, exposureMap, artifact);
    const toneClass = card.statusClass === "breach" ? "negative" : card.statusClass === "warning" || card.statusClass === "watch" ? "warning-text" : "";
    return `<article class="kpi-card factor-proxy-card">
      <span class="factor-proxy-label" title="${escapeHtml(card.tooltip)}">${escapeHtml(card.label)}</span>
      <div class="factor-proxy-value-row">
        <strong class="${toneClass}" title="Signed proxy loading">${card.exposureText}</strong>
        <span class="factor-proxy-direction">${escapeHtml(card.direction)}</span>
      </div>
      <small class="factor-proxy-limit">|Loading| / Limit ${escapeHtml(card.loadingLimitText)} · ${escapeHtml(card.utilizationText)}</small>
      ${card.utilization != null ? utilizationBar(card.utilization, card.rawStatus) : ""}
      <span class="badge ${card.statusClass}">${escapeHtml(card.statusLabel)}</span>
    </article>`;
  }).join("");
}

function renderAllocationBeforeAfterStrip(artifact) {
  const el = document.getElementById("allocationBeforeAfterStrip");
  if (!el) return;
  const current = proposalSession.simulation?.metricsBefore || {
    sharpe: metricNumeric(operatingMetric(artifact, "portfolio_sharpe")) ?? artifact.risk_summary?.portfolio_sharpe ?? 0,
    volatility: artifact.risk_summary?.portfolio_volatility || 0,
    var99: artifact.risk_summary?.portfolio_var_99 || 0,
    es95: artifact.risk_summary?.portfolio_expected_shortfall_95 || 0,
    maxDrawdown: artifact.risk_summary?.portfolio_max_drawdown || 0,
  };
  const proposed = proposalSession.simulation?.metrics || current;
  const corrSummary = artifact.correlation?.summary || {};
  const turnover = proposalSession.simulation?.turnover ?? 0;
  const total = Object.values(proposalSession.weights).reduce((sum, v) => sum + Number(v || 0), 0);
  const cash = 1 - total;
  const unchanged = proposalIsUnchanged(artifact, proposalSession.weights);
  const metrics = [
    ["Sharpe", current.sharpe, proposed.sharpe, false, false],
    ["Volatility", current.volatility, proposed.volatility, true, true],
    ["VaR 99%", current.var99, proposed.var99, true, true],
    ["ES 95%", current.es95, proposed.es95, true, true],
    ["Max DD", current.maxDrawdown, proposed.maxDrawdown, true, true],
    ["Avg |Corr|", corrSummary.average_abs_correlation || 0, corrSummary.average_abs_correlation || 0, true, false],
    ["Concentration", corrSummary.max_abs_correlation || 0, corrSummary.max_abs_correlation || 0, true, false],
    ["Residual Cash", cash, cash, true, true],
    ["Turnover", turnover, turnover, true, false],
    ["Txn Cost", proposalSession.simulation?.estimatedCost ?? 0, proposalSession.simulation?.estimatedCost ?? 0, true, false],
  ];
  el.innerHTML = `<div class="before-after-strip">${metrics.map(([label, before, after, lowerBetter, asPct]) => {
    const m = metricDelta(before, after, { lowerBetter, asPct, turnover: unchanged ? 0 : turnover });
    const avail = label.includes("Sharpe") && !operatingMetric(artifact, "portfolio_sharpe")?.available ? "N/A" : "";
    return `<div class="before-after-metric"><span class="label">${label}</span><span class="ba-values">${avail || `${m.beforeText} → ${m.afterText}`}</span><span class="ba-delta ${m.className}">${unchanged ? "No change" : m.label}</span></div>`;
  }).join("")}${unchanged ? `<div class="before-after-metric"><span class="label">Net improvement</span><span class="ba-values">—</span><span class="ba-delta neutral">No rebalance proposed</span></div>` : ""}</div>`;
}

function renderCompareAllocationKpis(artifact) {
  renderAllocationBeforeAfterStrip(artifact);
}

function renderAllocationPersistentChecks(artifact) {
  const el = document.getElementById("allocationPersistentChecks");
  if (!el) return;
  const total = Object.values(proposalSession.weights).reduce((sum, v) => sum + Number(v || 0), 0);
  const cash = 1 - total;
  const gateImpact = summarizeProposalGateImpact(proposalSession.simulation);
  const currentBreaches = countCurrentPortfolioBreaches(artifact);
  const reduceOnly = (artifact.strategies || []).filter((s) => {
    const e = formatEligibilityDisplay(s);
    return e.label.includes("reduce-only") || e.label.includes("under review");
  }).length;
  el.innerHTML = `
    <span>Proposed weight <strong>${pct(total, 1)}</strong></span>
    <span>Invested <strong>${pct(total, 1)}</strong></span>
    <span>Residual cash <strong>${pct(cash, 1)}</strong></span>
    <span>Reduce-only <strong>${reduceOnly}</strong></span>
    <span>Current portfolio breaches <strong class="${currentBreaches ? "negative" : ""}">${currentBreaches}</strong></span>
    <span>New proposal breaches <strong class="${gateImpact.newBreaches ? "negative" : ""}">${gateImpact.newBreaches}</strong></span>
    <span>Worsened breaches <strong class="${gateImpact.worsened ? "warning-text" : ""}">${gateImpact.worsened}</strong></span>
    <span>Improved/resolved <strong class="${gateImpact.improved ? "positive" : ""}">${gateImpact.improved}</strong></span>
    <span>Proposal gate blockers <strong class="${gateImpact.blockers ? "negative" : ""}">${gateImpact.blockers}</strong></span>
    <span>Turnover <strong>${pct(proposalSession.simulation?.turnover ?? 0, 1)}</strong></span>
    <span>Txn cost <strong>${money(proposalSession.simulation?.estimatedCost ?? 0)}</strong></span>`;
}

function renderDecisionStatusLines(artifact) {
  const el = document.getElementById("decisionStatusLines");
  if (!el) return;
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  el.innerHTML = `
    <div><strong>Proposal status:</strong> ${statusBadge(proposal.status)} — ${proposal.detail}</div>
    <div><strong>Human approval:</strong> ${localDecisionEvents.at(-1)?.event || "Not recorded"}</div>
    <div><strong>Execution authorization:</strong> disabled / not authorized</div>`;
}

function renderAllocationAnalysisPanels(artifact) {
  const factorTable = document.getElementById("factorConcentrationTable");
  const corrPanel = document.getElementById("correlationComparePanel");
  const budget = document.getElementById("riskBudgetUsage");
  const scenarioTable = document.getElementById("scenarioImpactTable");
  const currentExp = proposalSession.simulation?.factorExposureBefore || artifact.factors?.portfolio_factor_exposure_current || {};
  const proposedExp = proposalSession.simulation?.factorExposureAfter || artifact.factors?.portfolio_factor_exposure_proposed || artifact.factors?.portfolio_factor_exposure_current || {};
  const factorChecks = artifact.risk_limits?.factors?.checks || [];
  if (factorTable) {
    const keys = [...new Set([...Object.keys(currentExp), ...Object.keys(proposedExp)])].slice(0, 10);
    factorTable.innerHTML = `<tr><th>Factor</th><th>Current</th><th>Proposed</th><th>Limit</th><th>Util. Before</th><th>Util. After</th><th>Δ</th></tr>` +
      keys.map((factor) => {
        const check = factorChecks.find((c) => c.metric === factor || humanizeFactor(c.metric, artifact) === humanizeFactor(factor, artifact));
        const before = Number(currentExp[factor] || 0);
        const after = Number(proposedExp[factor] || 0);
        const utilBefore = check?.utilization ?? Math.abs(before);
        const utilAfter = check?.utilization ?? Math.abs(after);
        return `<tr><td>${humanizeFactor(factor, artifact)}</td><td>${num(before, 3)}</td><td>${num(after, 3)}</td><td>${check ? num(check.breach_threshold, 3) : "—"}</td><td>${utilizationBar(utilBefore, check?.status)}</td><td>${utilizationBar(utilAfter, check?.status)}</td><td class="${cls(after - before)}">${num(after - before, 3)}</td></tr>`;
      }).join("");
  }
  const corr = artifact.correlation?.summary || {};
  if (corrPanel) {
    corrPanel.innerHTML = `
      <p>Avg |correlation|: <strong>${num(corr.average_abs_correlation)}</strong> (before/after proxy)</p>
      <p>Duplicate-risk pairs: <strong>${corr.breach_count || 0}</strong></p>
      <p>Max |correlation|: <strong>${num(corr.max_abs_correlation)}</strong></p>`;
  }
  if (budget) {
    const exposure = currentExp;
    const maxAbs = Math.max(...Object.values(exposure).map((v) => Math.abs(Number(v) || 0)), 0.01);
    budget.innerHTML = Object.entries(exposure).slice(0, 8).map(([factor, value]) => `<div><span>${humanizeFactor(factor, artifact)}</span><div class="bar"><span style="width:${clamp(Math.abs(value) / maxAbs * 100, 4, 100)}%"></span></div><strong>${num(value, 3)}</strong></div>`).join("");
  }
  if (scenarioTable) {
    scenarioTable.innerHTML = `<tr><th>Scenario</th><th>Current</th><th>Proposed</th><th>Status</th></tr>` +
      (artifact.factors?.scenario_shock_table || []).slice(0, 8).map((row) => `<tr><td>${row.scenario}</td><td class="negative">${pct(row.estimated_portfolio_impact || 0, 2)}</td><td class="negative">${pct(row.estimated_portfolio_impact || 0, 2)}</td><td>${statusBadge(row.risk_status)}</td></tr>`).join("");
  }
}

function renderApprovalStatusBar(artifact) {
  const el = document.getElementById("approvalStatusBar");
  if (!el) return;
  const cost = proposalSession.simulation?.estimatedCost ?? artifact.allocation?.estimated_transaction_cost ?? 0;
  const gateImpact = summarizeProposalGateImpact(proposalSession.simulation);
  const simHardBlockers = (proposalSession.simulation?.checks || []).filter((check) => check.status === "breach");
  const currentBreaches = countCurrentPortfolioBreaches(artifact);
  const unchanged = proposalIsUnchanged(artifact, proposalSession.weights);
  const gateStatus = unchanged
    ? "Proposal gate status: clear (no allocation change)"
    : gateImpact.blockers
      ? `Proposal gate status: blocked (${gateImpact.blockers} blocker${gateImpact.blockers === 1 ? "" : "s"})`
      : "Proposal gate status: clear (no new or worsened blockers)";
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  const humanReview = proposal.status === "No rebalance proposed"
    ? "Human review: monitoring acknowledgement only"
    : proposal.status === "Simulation required"
      ? "Human review: pending simulation"
      : "Human review: required";
  const blocked = !unchanged && (gateImpact.blockers > 0 || simHardBlockers.length > 0);
  el.className = `approval-status-bar v2-approval-bar ${blocked ? "pending" : ""}`;
  el.innerHTML = `
    <div><strong>Proposal Status</strong><div>${statusBadge(proposal.status)} ${proposal.detail}</div></div>
    <div><strong>Est. Transaction Cost</strong><div>${money(proposal.status === "No rebalance proposed" ? 0 : cost)}</div></div>
    <div><strong>Optimizer</strong><div>${humanize(proposalSession.simulation?.optimizerLabel || artifact.rebalance_simulation?.official_optimizer?.optimizer_label, "Heuristic proposal")}</div></div>
    <div><strong>Proposal Gates</strong><div>${gateStatus}</div><small class="status-muted">Current portfolio breaches: ${currentBreaches}</small></div>
    <div><strong>Governance</strong><div>${humanReview} · Execution authorization: disabled</div></div>`;
  const approveBtn = document.getElementById("approveDecision");
  if (approveBtn) approveBtn.disabled = blocked;
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
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  const recs = artifact.recommendations || [];
  const impact = (artifact.decision_review?.expected_impact?.risk_metric_changes || []).slice(0, 4);
  el.innerHTML = `
    <p><strong>Proposal status:</strong> ${statusBadge(proposal.status)} — ${proposal.detail}</p>
    <ul>${recs.slice(0, 5).map((rec) => `<li>${escapeHtml(humanizeUserFacingText(rec.action, artifact))}: ${escapeHtml(humanizeUserFacingText(rec.rationale, artifact))}</li>`).join("")}</ul>
    <p><strong>Expected metric shifts (official optimizer):</strong></p>
    <ul>${impact.map((metric) => `<li>${humanize(metric.metric)} ${num(metric.current, 3)} → ${num(metric.proposed, 3)} (${metric.expected_outcome})</li>`).join("") || "<li>Run simulation to refresh custom-weight impact.</li>"}</ul>
    <p><strong>Current portfolio breaches:</strong> ${countCurrentPortfolioBreaches(artifact)} · <strong>Proposal gate blockers:</strong> ${summarizeProposalGateImpact(proposalSession.simulation).blockers}</p>`;
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
  renderAllocationBars(uiStrategies(artifact));
  renderContributorsDetractorsTables(artifact);
  renderOperatingLedgerOrCharts(artifact);
  renderRiskActionCenter(artifact);
  renderRebalancePreview(artifact);
  renderCommandMarketMini(artifact);
  renderCommandWatchlistPanels(artifact);
  renderMonitorKpiStrip(artifact);
  renderFactorKpiGrid(artifact);
  renderAllocationBeforeAfterStrip(artifact);
  renderAllocationAnalysisPanels(artifact);
  renderApprovalStatusBar(artifact);
  renderDecisionStatusLines(artifact);
  renderAllocationPersistentChecks(artifact);
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

function drawOperatingPeriodCharts(series = {}) {
  drawSingleMetricChart(document.getElementById("pnlCanvas"), series.cumulative_return || [], {
    label: "Cumulative return",
    color: "#1ac8ff",
    format: (value) => pct(value, 2),
  });
  drawSingleMetricChart(document.getElementById("drawdownCanvas"), series.drawdown || [], {
    label: "Drawdown",
    color: "#ff5a4f",
    format: (value) => pct(value, 2),
  });
}

function drawSingleMetricChart(canvas, values = [], options = {}) {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  const series = downsampleSeries((values || []).filter(Number.isFinite), Math.max(80, Math.floor(w * 1.1)));
  ctx.clearRect(0, 0, w, h);
  if (!series.length) {
    ctx.fillStyle = "rgba(211, 234, 240, .72)";
    ctx.font = "12px Inter, system-ui";
    ctx.fillText("Operating-period series unavailable.", 12, 24);
    return;
  }
  const pad = { l: 44, r: 16, t: 20, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 0.001);
  ctx.strokeStyle = "rgba(160, 205, 218, .13)";
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.t + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }
  ctx.strokeStyle = options.color || "#1ac8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pathFromSeries(ctx, series, pad.l, pad.t, plotW, plotH, min, max);
  ctx.stroke();
  ctx.fillStyle = "rgba(211, 234, 240, .72)";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText(options.label || "Series", pad.l, 12);
  ctx.textAlign = "right";
  ctx.fillText(options.format ? options.format(series.at(-1) || 0) : num(series.at(-1) || 0), w - 8, 12);
  ctx.textAlign = "left";
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

function drawReturnDistributionChart(canvas, returns = []) {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  ctx.clearRect(0, 0, w, h);
  const values = (returns || []).filter(Number.isFinite);
  if (!values.length) {
    drawDrawerChartMessage(canvas, "Chart unavailable — no strategy series supplied");
    return;
  }
  const bins = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) || 1e-6;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((value - min) / width) * bins)));
    counts[idx] += 1;
  });
  const peak = Math.max(...counts, 1);
  const pad = { l: 28, r: 8, t: 18, b: 18 };
  ctx.fillStyle = "rgba(211, 234, 240, .72)";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText("Daily return distribution", pad.l, 12);
  counts.forEach((count, i) => {
    const barW = (w - pad.l - pad.r) / bins - 2;
    const x = pad.l + i * ((w - pad.l - pad.r) / bins);
    const barH = (count / peak) * (h - pad.t - pad.b);
    ctx.fillStyle = "rgba(26, 200, 255, 0.65)";
    ctx.fillRect(x, h - pad.b - barH, barW, barH);
  });
}

function researchDecisionLabel(backtest, walk = {}) {
  const action = String(backtest?.action?.priority || backtest?.action?.label || "").toLowerCase();
  if (action.includes("reject") || action.includes("pause")) return "Reject";
  if (action.includes("redesign") || action.includes("modify")) return "Redesign";
  if (action.includes("watch") || action.includes("research")) return "Keep Researching";
  if ((walk.positive_windows || 0) >= (walk.number_of_windows || 1) * 0.5 && (backtest.net_metrics?.sharpe || 0) > 0.5) return "Eligible";
  return "Keep Researching";
}

function populateResearchLabSelector(artifact) {
  const select = document.getElementById("researchLabSelector");
  if (!select) return;
  const results = mergedResearchResults.length ? mergedResearchResults : buildMergedResearchResults(artifact);
  const groupOrder = ["CURRENT_US_EQUITY_RESEARCH", "STRATEGY_21", "ARCHIVED_US_EQUITY_RESEARCH", "LEGACY_PROXY"];
  const presentGroups = groupOrder.filter((group) => results.some((row) => (row.research_group || "LEGACY_PROXY") === group));
  select.innerHTML = presentGroups.map((group) => {
    const options = results
      .filter((row) => (row.research_group || "LEGACY_PROXY") === group)
      .map((row) => `<option value="${row._index}">${escapeHtml(row.backtest?.name || row.strategy_id)}</option>`)
      .join("");
    return `<optgroup label="${escapeHtml(RESEARCH_GROUP_LABELS[group] || group)}">${options}</optgroup>`;
  }).join("");
  select.onchange = () => {
    const item = results[Number(select.value)];
    if (item) renderResearchLabPanels(item);
  };
  const defaultItem = findResearchLabItem(DEFAULT_RESEARCH_STRATEGY_ID) || results[0];
  if (defaultItem) {
    select.value = String(defaultItem._index);
    renderResearchLabPanels(defaultItem);
  }
}

function renderUnavailablePanel(elementId, message = "NOT AVAILABLE IN CURRENT BASELINE") {
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = `<p class="status-muted">${escapeHtml(message)}</p>`;
}

function renderFactoryResearchPanels(backtest, walk, item) {
  const factory = backtest.factory_research || {};
  const header = document.getElementById("researchStrategyHeader");
  if (header) {
    header.innerHTML = `
      <p><strong>${escapeHtml(backtest.strategy_id)}</strong> · ${escapeHtml(backtest.name)}</p>
      <p>Family <strong>${escapeHtml(backtest.strategy_family || "n/a")}</strong> · Asset class <strong>${escapeHtml(backtest.asset_class || "US individual equities")}</strong></p>
      <p>Lifecycle <strong>${escapeHtml(backtest.lifecycle_status || "n/a")}</strong> · Allocation eligible <strong>${backtest.allocation_eligible ? "YES" : "NO"}</strong></p>
      <p>Test period <strong>${escapeHtml(backtest.test_period_start || "n/a")} → ${escapeHtml(backtest.test_period_end || "n/a")}</strong> · Latest data <strong>${escapeHtml(backtest.latest_data_date || "n/a")}</strong></p>
      <p>Gross cumulative <strong>${pct(backtest.gross_metrics?.cumulative_return || 0, 1)}</strong> · Net cumulative <strong>${pct(backtest.net_metrics?.cumulative_return || 0, 1)}</strong></p>
      <p>Mean IC <strong>${factory.mean_ic == null ? "N/A" : num(factory.mean_ic, 4)}</strong> · D1 / D10 spread proxy <strong>${factory.decile_spread == null ? "N/A" : num(factory.decile_spread, 5)}</strong></p>`;
  }
  const icPanel = document.getElementById("researchIcPanel");
  const ic = factory.ic_packet || {};
  if (icPanel) {
    if (!ic.available) {
      icPanel.innerHTML = `<p class="status-muted">NOT AVAILABLE IN CURRENT BASELINE</p>`;
    } else {
      const decileRows = Object.entries(ic.deciles || {})
        .map(([key, value]) => `<tr><td>${escapeHtml(key.replace("decile_", "D"))}</td><td>${pct(value || 0, 3)}</td></tr>`)
        .join("");
      icPanel.innerHTML = `
        <p>Mean IC <strong>${num(ic.mean_ic, 4)}</strong> · D1 <strong>${pct(ic.d1 || 0, 3)}</strong> · D10 <strong>${pct(ic.d10 || 0, 3)}</strong> · Spread <strong>${num(ic.decile_spread, 5)}</strong></p>
        <p>IC time series: <strong>${ic.ic_time_series_available ? "available" : "NOT AVAILABLE IN CURRENT BASELINE"}</strong></p>
        <div class="table-viewport short"><div class="table-scroll"><table class="data-table dense"><tr><th>Decile</th><th>Mean Forward Return</th></tr>${decileRows || "<tr><td colspan='2'>NOT AVAILABLE IN CURRENT BASELINE</td></tr>"}</table></div></div>`;
    }
  }
  const turnoverPanel = document.getElementById("researchTurnoverPanel");
  if (turnoverPanel) {
    turnoverPanel.innerHTML = `
      <p>Average daily turnover <strong>${backtest.turnover?.average_daily_turnover == null ? "N/A" : num(backtest.turnover.average_daily_turnover, 3)}</strong></p>
      <p>Annualized turnover <strong>${backtest.turnover?.annualized_turnover == null ? "N/A" : `${num(backtest.turnover.annualized_turnover, 1)}x`}</strong></p>
      <p>Total transaction-cost drag <strong>${backtest.turnover?.total_cost_drag == null ? "N/A" : pct(backtest.turnover.total_cost_drag, 2)}</strong></p>
      <p>Gross vs net cumulative gap <strong>${pct((backtest.gross_metrics?.cumulative_return || 0) - (backtest.net_metrics?.cumulative_return || 0), 2)}</strong></p>`;
  }
  const attributionPanel = document.getElementById("researchAttributionPanel");
  const attribution = factory.attribution || {};
  if (attributionPanel) {
    if (!attribution.available) {
      attributionPanel.innerHTML = `<p class="status-muted">${escapeHtml(attribution.message || "NOT AVAILABLE IN CURRENT BASELINE")}</p>`;
    } else {
      attributionPanel.innerHTML = `
        <p>Long contribution <strong>${pct(attribution.long_contribution_total || 0, 2)}</strong> · Short contribution <strong>${pct(attribution.short_contribution_total || 0, 2)}</strong></p>
        <p>Long share of gross <strong>${attribution.long_share == null ? "N/A" : pct(attribution.long_share, 1)}</strong> · Short share <strong>${attribution.short_share == null ? "N/A" : pct(attribution.short_share, 1)}</strong></p>`;
    }
  }
  const logicPanel = document.getElementById("researchLogicPanel");
  const logic = factory.logic || {};
  if (logicPanel) {
    logicPanel.innerHTML = Object.entries({
      "Economic hypothesis": logic.economic_hypothesis,
      "Expected return driver": logic.expected_return_driver,
      "Signal inputs": logic.signal_inputs,
      "Score direction": logic.score_direction,
      "Long leg": logic.long_leg,
      "Short leg": logic.short_leg,
      "Rebalance frequency": logic.rebalance_frequency,
      "Execution timing": logic.execution_timing,
      "Transaction-cost assumption": logic.transaction_cost_assumption,
      "Likely failure regime": logic.likely_failure_regime,
    }).map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value || "NOT AVAILABLE IN CURRENT BASELINE")}</p>`).join("");
  }
  const factorPanel = document.getElementById("researchFactorPanel");
  const factors = factory.factor_interpretation || [];
  if (factorPanel) {
    factorPanel.innerHTML = factors.length
      ? factors.map((row) => `<p><span class="badge warning">${escapeHtml(row.kind)}</span> <strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.detail)}</p>`).join("")
      : `<p class="status-muted">NOT YET MEASURED in current baseline artifacts; see candidate-pool economic interpretation only.</p>`;
  }
  const limitationsPanel = document.getElementById("researchLimitationsPanel");
  if (limitationsPanel) {
    const limitations = factory.limitations || [];
    limitationsPanel.innerHTML = `<ul>${limitations.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  }
  if (backtest.strategy_id === "STRATEGY_21_RESEARCH_COMPOSITE_V1" && factory.strategy_21) {
    const s21 = factory.strategy_21;
    if (header) {
      header.innerHTML += `
        <p>Members <strong>${s21.members.map((member) => `${member.strategy_id} (${pct(member.weight || 0, 0)})`).join(" · ")}</strong></p>
        <p>Composite cumulative <strong>${pct(backtest.net_metrics?.cumulative_return || 0, 2)}</strong> · Sharpe <strong>${num(backtest.net_metrics?.sharpe)}</strong> · Vol <strong>${pct(backtest.net_metrics?.annual_volatility || 0, 2)}</strong> · Max DD <strong>${pct(backtest.net_metrics?.max_drawdown || 0, 2)}</strong></p>`;
    }
    if (factorPanel) {
      const pairwise = (s21.pairwise_analysis || []).map((row) =>
        `<tr><td>${escapeHtml(row.strategy_left)} / ${escapeHtml(row.strategy_right)}</td><td>${num(row.daily_net_return_correlation, 3)}</td><td>${num(row.rolling_60d_correlation_latest, 3)}</td><td>${num(row.drawdown_overlap, 3)}</td><td>${escapeHtml(row.distinctness_decision || "")}</td></tr>`,
      ).join("");
      factorPanel.innerHTML += `
        <div class="panel-title sub">Strategy 21 Pairwise Correlation</div>
        <div class="table-viewport short"><div class="table-scroll"><table class="data-table dense">
          <tr><th>Pair</th><th>Daily Corr</th><th>Latest 60D Corr</th><th>DD Overlap</th><th>Decision</th></tr>
          ${pairwise || "<tr><td colspan='5'>NOT AVAILABLE IN CURRENT BASELINE</td></tr>"}
        </table></div></div>
        <p>Excluded member: <strong>C2A2_002</strong> — ${escapeHtml((s21.excluded_members || [])[0]?.reason || "economic duplicate")}</p>
        <p>Concentration alert: <strong>${(s21.alerts?.component_over_50pct_total_pnl || []).join(", ") || "none"}</strong></p>`;
    }
  }
  if (walk?.status && String(walk.status).includes("NOT AVAILABLE")) {
    document.getElementById("walkForwardTable").innerHTML = `<tr><td colspan="6">${escapeHtml(walk.status)}</td></tr>`;
  }
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
  const packetSeries = backtest.risk_packet?.chart_series || {};
  const caption = document.getElementById("researchLabCaption");
  if (caption) {
    const sourceLabel = backtest.research_source === "strategy_factory_v1"
      ? "US equity Strategy Factory baseline"
      : (backtest.literature_source || "literature prototype");
    caption.textContent = `${backtest.name} | ${sourceLabel} | ${dates[0] || "n/a"} to ${dates.at(-1) || "n/a"}`;
  }
  const summary = document.getElementById("researchLabSummaryStrip");
  if (summary) {
    summary.innerHTML = `
      <span>Gross cum. <strong>${pct(backtest.gross_metrics?.cumulative_return || 0, 1)}</strong></span>
      <span>Net cum. <strong>${pct(backtest.net_metrics?.cumulative_return || 0, 1)}</strong></span>
      <span>Net ann. return <strong>${pct(backtest.net_metrics?.annual_return || 0, 1)}</strong></span>
      <span>Sharpe <strong>${num(backtest.net_metrics?.sharpe)}</strong></span>
      <span>Vol <strong>${pct(backtest.net_metrics?.annual_volatility || 0, 1)}</strong></span>
      <span>Max DD <strong>${pct(backtest.net_metrics?.max_drawdown || 0, 1)}</strong></span>
      <span>Turnover <strong>${backtest.turnover?.annualized_turnover == null ? "N/A" : `${num(backtest.turnover.annualized_turnover, 1)}x`}</strong></span>
      <span>Cost drag <strong>${pct(backtest.turnover?.annualized_cost_drag || 0, 2)}</strong></span>
      <span>OOS avg Sharpe <strong>${walk.average_test_sharpe == null ? "N/A" : num(walk.average_test_sharpe)}</strong></span>
      <span>Positive OOS windows <strong>${(walk.windows || []).length ? formatOosWindows(walk) : "N/A"}</strong></span>`;
  }
  drawGrossNetEquityChart(document.getElementById("backtestCanvas"), dates, gross, net);
  drawDrawdownChart(document.getElementById("researchDrawdownCanvas"), packetSeries.drawdown || []);
  drawRollingSharpeChart(document.getElementById("researchRollingCanvas"), packetSeries.rolling_63d_sharpe || packetSeries.rolling_sharpe || []);
  drawReturnDistributionChart(document.getElementById("researchDistributionCanvas"), net);
  const decision = document.getElementById("researchLabDecision");
  if (decision) {
    const label = researchDecisionLabel(backtest, walk);
    decision.innerHTML = `<p>${statusBadge(label)} <strong>Research decision:</strong> ${label}</p><p class="status-muted">${escapeHtml(backtest.action?.interpretation || backtest.hypothesis || "Based on literature backtest evidence only.")}</p>`;
  }
  document.getElementById("walkForwardTable").innerHTML = "<tr><th>Train</th><th>Test</th><th>Train Sharpe</th><th>Test Sharpe</th><th>Test Return</th><th>Test Max DD</th></tr>" +
    (walk.windows || []).slice(-12).map((window) => `<tr><td>${window.train_start} → ${window.train_end}</td><td>${window.test_start} → ${window.test_end}</td><td>${num(window.train_sharpe)}</td><td>${num(window.test_sharpe)}</td><td class="${cls(window.test_return || 0)}">${pct(window.test_return || 0, 2)}</td><td class="negative">${pct(window.test_max_drawdown || 0, 2)}</td></tr>`).join("") ||
    `<tr><td colspan='6'>${escapeHtml(walk.status || "Walk-forward windows unavailable.")}</td></tr>`;
  document.querySelectorAll("[data-literature-strategy]").forEach((row) => {
    row.classList.toggle("selected", Number(row.dataset.literatureStrategy) === (item._index ?? -1));
  });
  document.querySelectorAll("[data-open-research-lab]").forEach((row) => {
    row.classList.toggle("selected", row.dataset.openResearchLab === (item.strategy_id || item.backtest?.strategy_id));
  });
  const selector = document.getElementById("researchLabSelector");
  if (selector && item._index != null) selector.value = String(item._index);
  const packet = backtest.risk_packet || {};
  if (backtest.research_source === "strategy_factory_v1") {
    renderFactoryResearchPanels(backtest, walk, item);
  } else {
    renderUnavailablePanel("researchStrategyHeader");
    renderUnavailablePanel("researchIcPanel");
    renderUnavailablePanel("researchTurnoverPanel");
    renderUnavailablePanel("researchAttributionPanel");
    renderUnavailablePanel("researchLogicPanel");
    renderUnavailablePanel("researchFactorPanel");
    renderUnavailablePanel("researchLimitationsPanel");
  }
  if (packet.summary_statistics || (walk.windows || []).length) {
    renderLiteratureChecklist(backtest, packet, walk);
  } else if (backtest.research_source === "strategy_factory_v1") {
    renderResearchChecklistHtml([
      {
        title: "Research Quality Checks",
        status: "Partial",
        items: [
          `Lifecycle status: ${backtest.lifecycle_status || "n/a"}.`,
          `Decision: ${backtest.action?.interpretation || factoryDecisionText(backtest)}.`,
          "Walk-forward validation is not included in the current Strategy Factory baseline artifacts.",
        ],
        prompt: "Treat this as screening evidence only until walk-forward and live shadow coverage are complete.",
      },
    ]);
  } else {
    renderResearchChecklistUnavailable("No-look-ahead checklist unavailable for this literature prototype. Risk packet or walk-forward evidence is missing.");
  }
}

function factoryDecisionText(backtest) {
  return backtest.factory_research?.decision_reason || backtest.action?.interpretation || "See research decision panel.";
}

function renderResearchChecklistUnavailable(message) {
  const el = document.getElementById("researchChecklist");
  if (!el) return;
  el.innerHTML = `<p class="status-muted">${escapeHtml(message || "No-look-ahead checklist unavailable. Select a literature prototype with validated research evidence.")}</p>`;
}

function renderResearchChecklistHtml(checklist) {
  const el = document.getElementById("researchChecklist");
  if (!el) return;
  if (!checklist?.length) {
    renderResearchChecklistUnavailable();
    return;
  }
  el.innerHTML = checklist.map((section) => `
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

const DRAWER_CHART_UNAVAILABLE = "Chart unavailable — no strategy series supplied";

function strategyChartSeries(strategy) {
  const series = strategy?.risk_packet?.chart_series || {};
  return {
    dates: series.dates || [],
    returns: series.returns || [],
    cumulative_return: series.cumulative_return || [],
    drawdown: series.drawdown || [],
    rolling_sharpe: series.rolling_63d_sharpe || series.rolling_sharpe || [],
  };
}

function chartHasFiniteValues(values) {
  return (values || []).some((value) => Number.isFinite(Number(value)));
}

function cumulativeFromReturns(returns) {
  let wealth = 1;
  return (returns || []).map((value) => {
    wealth *= 1 + (Number(value) || 0);
    return wealth - 1;
  });
}

function literatureBacktestForStrategy(strategy, artifact = activeArtifact) {
  return (artifact?.literature_strategy_backtests?.results || []).find(
    (row) => row.backtest?.strategy_id === strategy?.strategy_id,
  )?.backtest;
}

function grossNetCumulativeSeries(strategy, artifact, length) {
  const returnSeries = literatureBacktestForStrategy(strategy, artifact)?.return_series;
  if (!returnSeries?.gross_returns?.length || !returnSeries?.net_returns?.length) return null;
  const sliceLen = length || returnSeries.net_returns.length;
  return {
    gross: cumulativeFromReturns(returnSeries.gross_returns.slice(-sliceLen)),
    net: cumulativeFromReturns(returnSeries.net_returns.slice(-sliceLen)),
  };
}

function drawDrawerChartMessage(canvas, message = DRAWER_CHART_UNAVAILABLE) {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(211, 234, 240, .72)";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText(message, 12, Math.max(24, h / 2));
}

function drawDrawerLineChart(canvas, values, options = {}) {
  if (!canvas) return;
  if (!chartHasFiniteValues(values)) {
    drawDrawerChartMessage(canvas, options.emptyMessage || DRAWER_CHART_UNAVAILABLE);
    return;
  }
  drawSingleMetricChart(
    canvas,
    (values || []).map((value) => Number(value)).filter(Number.isFinite),
    {
      label: options.label || "Series",
      color: options.color || "#1ac8ff",
      format: options.format || ((value) => num(value, 2)),
    },
  );
}

function drawCumulativeReturnChart(canvas, values, options = {}) {
  drawDrawerLineChart(canvas, values, {
    label: options.label || "Net cumulative return",
    color: options.color || "#1ac8ff",
    format: (value) => pct(value, 2),
    emptyMessage: options.emptyMessage,
  });
}

function drawDrawdownChart(canvas, values) {
  drawDrawerLineChart(canvas, values, {
    label: "Drawdown",
    color: "#ff5a4f",
    format: (value) => pct(value, 2),
  });
}

function drawRollingSharpeChart(canvas, values) {
  const rolling = (values || []).map((value) => (value == null ? NaN : Number(value))).filter(Number.isFinite);
  drawDrawerLineChart(canvas, rolling, {
    label: "Rolling Sharpe (63D)",
    color: "#f5c542",
    format: (value) => num(value, 2),
  });
}

function drawGrossNetCumulativeChart(canvas, gross, net) {
  if (!canvas) return;
  const { ctx, w, h } = canvasScale(canvas);
  ctx.clearRect(0, 0, w, h);
  const grossSeries = downsampleSeries((gross || []).filter(Number.isFinite), Math.max(80, Math.floor(w * 1.1)));
  const netSeries = downsampleSeries((net || []).filter(Number.isFinite), Math.max(80, Math.floor(w * 1.1)));
  if (!grossSeries.length && !netSeries.length) {
    drawDrawerChartMessage(canvas);
    return;
  }
  const pad = { l: 44, r: 16, t: 24, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const combined = [...grossSeries, ...netSeries];
  const min = Math.min(...combined, 0);
  const max = Math.max(...combined, 0.001);
  ctx.strokeStyle = "rgba(160, 205, 218, .13)";
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.t + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(211, 234, 240, .72)";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText("Gross vs net cumulative return", pad.l, 12);
  ctx.textAlign = "right";
  ctx.fillStyle = "#9fd8ff";
  ctx.fillText("● Gross", w - pad.r, 12);
  ctx.fillStyle = "#1ac8ff";
  ctx.fillText("● Net", w - pad.r - 58, 12);
  ctx.textAlign = "left";
  if (grossSeries.length) {
    ctx.strokeStyle = "#9fd8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pathFromSeries(ctx, grossSeries, pad.l, pad.t, plotW, plotH, min, max);
    ctx.stroke();
  }
  if (netSeries.length) {
    ctx.strokeStyle = "#1ac8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pathFromSeries(ctx, netSeries, pad.l, pad.t, plotW, plotH, min, max);
    ctx.stroke();
  }
}

function drawerChartBlock(title, canvasId, legendHtml = "") {
  return `<section class="drawer-chart-block">
    <div class="drawer-chart-head"><strong>${title}</strong>${legendHtml ? `<span class="drawer-chart-legend">${legendHtml}</span>` : ""}</div>
    <canvas id="${canvasId}" class="drawer-canvas compact" width="380" height="110"></canvas>
  </section>`;
}

function paintDrawerViewCharts(strategy, view, artifact = activeArtifact) {
  const series = strategyChartSeries(strategy);
  if (view === "overview") {
    drawCumulativeReturnChart(document.getElementById("drawerOverviewCumCanvas"), series.cumulative_return, {
      label: "Net cumulative performance",
    });
    drawDrawdownChart(document.getElementById("drawerOverviewDdCanvas"), series.drawdown);
    return;
  }
  if (view === "performance") {
    const grossNet = grossNetCumulativeSeries(strategy, artifact, series.cumulative_return.length);
    if (grossNet) {
      drawGrossNetCumulativeChart(
        document.getElementById("drawerPerfGrossNetCanvas"),
        grossNet.gross,
        grossNet.net,
      );
    } else {
      drawCumulativeReturnChart(
        document.getElementById("drawerPerfGrossNetCanvas"),
        series.cumulative_return,
        { label: "Net cumulative return (gross series unavailable)" },
      );
    }
    drawDrawdownChart(document.getElementById("drawerPerfDrawdownCanvas"), series.drawdown);
    drawRollingSharpeChart(document.getElementById("drawerPerfRollingSharpeCanvas"), series.rolling_sharpe);
  }
}

function openLiteratureStrategyReview(item, artifact) {
  const backtest = item.backtest;
  const walk = item.walk_forward || {};
  const strategy = (artifact?.strategies || []).find((s) => s.strategy_id === backtest?.strategy_id)
    || (artifact?.strategies || [])[0];
  if (strategy) openStrategyReview(strategy, artifact);
  const caption = document.getElementById("researchLabCaption");
  if (caption && backtest) {
    caption.textContent = `${backtest.name} | ${backtest.literature_source || "literature"} | WFO avg Sharpe ${num(walk.average_test_sharpe)} | ${walk.status || "pending"}`;
  }
  renderResearchLabPanels(item);
}

function renderEmptyLiteraturePacket() {
  ["literatureDetailSummary", "literatureRegimeBreakdown", "literatureBenchmarkComparison", "literatureWorstDays"].forEach((id) => {
    document.getElementById(id).innerHTML = "<tr><td>Open a literature prototype to view real yfinance-backed diagnostics.</td></tr>";
  });
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
  renderResearchChecklistHtml(checklist);
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

function renderLiteratureStrategies(snapshot, results = mergedResearchResults) {
  const rows = results.length ? results : (snapshot.results || []);
  if (!rows.length) {
    document.getElementById("literatureStrategyTable").innerHTML = "<tr><td>No research strategies loaded yet.</td></tr>";
    renderResearchChecklistUnavailable("No research strategies loaded. Select a strategy after factory research artifacts are available.");
    return;
  }
  document.getElementById("literatureStrategyTable").innerHTML = "<tr><th>Strategy</th><th>Group</th><th>Source</th><th>Net Sharpe</th><th>Ann. Return</th><th>Max DD</th><th>Cost Drag</th><th>WFO</th><th>Action</th><th>Reason</th></tr>" +
    rows.map((item, idx) => {
      const backtest = item.backtest;
      const walk = item.walk_forward || {};
      const net = backtest.net_metrics || {};
      const turnover = backtest.turnover || {};
      const action = backtest.action || {};
      const badge = action.action === "Reject" || action.action === "Pause" ? "breach" : action.action === "Keep Researching" ? "ok" : "warning";
      const groupLabel = RESEARCH_GROUP_LABELS[item.research_group] || item.research_group || "Research";
      return `<tr class="table-link-row" data-literature-strategy="${item._index ?? idx}" data-open-research-lab="${escapeHtml(item.strategy_id || backtest.strategy_id)}">
        <td>${escapeHtml(backtest.name)}</td>
        <td>${escapeHtml(groupLabel)}</td>
        <td>${escapeHtml(backtest.literature_source || backtest.research_source || "research")}</td>
        <td>${(net.sharpe || 0).toFixed(2)}</td>
        <td class="${cls(net.annual_return || 0)}">${pct(net.annual_return || 0, 2)}</td>
        <td class="negative">${pct(net.max_drawdown || 0, 2)}</td>
        <td>${pct(turnover.annualized_cost_drag || 0, 2)}</td>
        <td>${walk.status || "pending"}</td>
        <td><span class="badge ${badge}">${action.action || "Review"}</span></td>
        <td>${escapeHtml(backtest.factory_research?.decision_reason || action.reason_code || "pending")}</td>
      </tr>`;
    }).join("");
  const activateRow = (item) => {
    if (!item) return;
    renderResearchLabPanels(item);
    setActiveTab("Backtesting & Research Lab");
  };
  document.querySelectorAll("[data-literature-strategy]").forEach((row) => {
    row.addEventListener("click", () => activateRow(rows[Number(row.dataset.literatureStrategy)]));
  });
  document.querySelectorAll("[data-open-research-lab]").forEach((row) => {
    row.addEventListener("click", () => activateRow(findResearchLabItem(row.dataset.openResearchLab)));
  });
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
  renderCommandKpiStrip(artifact);
  renderAllocationBeforeAfterStrip(artifact);
}

function renderCommandKpiStrip(artifact) {
  const el = document.getElementById("commandKpiStrip");
  if (!el) return;
  const usingResearch = typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length;
  const series = uiPortfolioSeries(artifact);
  const cumulative = series.cumulative_return || [];
  const composite = usingResearch ? ResearchUniverse.compositeItem()?.backtest : null;
  const hist = composite?.net_metrics || historicalResearchRiskSummary(artifact);
  const shadowComposite = usingResearch ? ResearchUniverse.intradayComposite() : null;
  const latestCum = composite?.net_metrics?.cumulative_return ?? cumulative.at(-1) ?? 0;
  const latestReturn = shadowComposite?.daily_return;
  const pnlLabel = shadowComposite?.available === false || latestReturn == null ? "Unavailable" : "Intraday shadow estimate";
  const dailyPnl = latestReturn == null ? null : latestReturn * (artifact.initial_capital || 0);
  const headline = canonicalRiskHeadline(artifact);
  const issueCounts = countIssueCategories(artifact);
  const breached = issueCounts.breached_controls;
  const dq = artifact.data_quality || {};
  const intradayDq = dq.intraday || artifact.intraday_marks?.data_quality || {};
  el.innerHTML = compactKpiStrip([
    ["Strategy 21 Status", composite?.lifecycle_status || "RESEARCH COMPOSITE", "NOT LIVE · NOT ALLOCATION APPROVED", "warning-text"],
    ["Historical Net Return", composite?.net_metrics?.cumulative_return == null ? "N/A" : pct(composite.net_metrics.cumulative_return, 1), "Strategy 21 research baseline", cls(latestCum)],
    ["Historical Sharpe", composite?.net_metrics?.sharpe == null ? "N/A" : num(composite.net_metrics.sharpe, 2), "Research composite", ""],
    ["Historical Max DD", composite?.net_metrics?.max_drawdown == null ? "N/A" : pct(composite.net_metrics.max_drawdown, 1), "Research composite", "negative"],
    ["Authoritative PnL", pnlLabel, shadowComposite?.status || "Shadow intraday incomplete", latestReturn == null ? "warning-text" : cls(latestReturn)],
    ["Daily PnL", dailyPnl == null ? "Unavailable" : money(dailyPnl), pnlLabel, dailyPnl == null ? "warning-text" : cls(latestReturn)],
    ["Research Weights", "50% / 50%", "C2A2_020 / C2B2_004", ""],
    ["Breached Controls", String(breached), `${issueCounts.current_model_issues} current-model issues`, breached ? "negative" : ""],
    ["Data Quality", humanize(intradayDq.freshness || dq.overall_status || "monitor"), intradayDq.freshness ? "Intraday shadow" : "Research baseline", intradayDq.freshness === "Stale" || intradayDq.freshness === "Failed" ? "warning-text" : ""],
  ]);
}

function renderOperatingLedgerOrCharts(artifact) {
  const series = uiPortfolioSeries(artifact);
  const obs = (series.returns || []).length;
  const wrap = document.getElementById("operatingLedgerWrap");
  const pnlCanvas = document.getElementById("pnlCanvas");
  const ddPanel = document.getElementById("operatingDrawdownPanel");
  const caption = document.getElementById("pnlChartCaption");
  if (caption) {
    caption.textContent = typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode()
      ? "Strategy 21 historical research cumulative return · not live PnL"
      : `Operating period since ${investmentStart(artifact)} · Historical research context in Research Lab`;
  }
  const capital = artifact.initial_capital || 0;
  if (obs < 5 && wrap) {
    wrap.innerHTML = `<div class="table-viewport short operating-ledger-viewport"><div class="table-scroll"><table class="data-table dense operating-ledger-table"><tr><th>Date</th><th>Daily Return</th><th>Daily PnL</th><th>Model NAV</th><th>Cumulative Return</th><th>Drawdown</th></tr>
      ${(series.dates || []).slice(-obs).map((date, i) => {
        const idx = series.dates.length - obs + i;
        const dailyReturn = series.returns[idx] || 0;
        const cumReturn = series.cumulative_return?.[idx] || 0;
        return `<tr><td>${date}</td><td class="${cls(dailyReturn)}">${pct(dailyReturn, 2)}</td><td class="${cls(dailyReturn)}">${money(dailyReturn * capital)}</td><td>${money(capital * (1 + cumReturn))}</td><td>${pct(cumReturn, 2)}</td><td class="negative">${pct(series.drawdown?.[idx] || 0, 2)}</td></tr>`;
      }).join("")}</table></div></div>`;
    if (pnlCanvas) pnlCanvas.style.display = "none";
    if (ddPanel) ddPanel.style.display = "none";
  } else {
    if (wrap) wrap.innerHTML = "";
    if (pnlCanvas) pnlCanvas.style.display = "block";
    if (ddPanel) ddPanel.style.display = "";
    drawOperatingPeriodCharts(series);
  }
}

function renderContributorsDetractorsTables(artifact) {
  const usingResearch = typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length;
  const strategies = usingResearch
    ? uiStrategies(artifact).filter((row) => row.current_weight > 0)
    : (artifact.strategies || []).filter((s) => s.current_weight > 0);
  const positive = [...strategies].filter((s) => (s.daily_pnl || 0) > 0).sort((a, b) => (b.daily_pnl || 0) - (a.daily_pnl || 0)).slice(0, 6);
  const negative = [...strategies].filter((s) => (s.daily_pnl || 0) < 0).sort((a, b) => (a.daily_pnl || 0) - (b.daily_pnl || 0)).slice(0, 6);
  const row = (s) => {
    const driver = s.primary_return_driver || s.risk_manager_question_answered?.why || s.hypothesis || "—";
    const shortDriver = driver.length > 48 ? `${driver.slice(0, 45)}…` : driver;
    const pnlText = usingResearch ? "Unavailable" : money(s.daily_pnl || 0);
    return `<tr><td>${s.name}</td><td class="col-num">${pnlText}</td><td class="col-pct">${pct(s.current_weight || 0)}</td><td class="wrap-cell" title="${escapeHtml(driver)}">${escapeHtml(shortDriver)}</td></tr>`;
  };
  const ct = document.getElementById("contributorsTable");
  const dt = document.getElementById("detractorsTable");
  const emptyMsg = usingResearch ? "Intraday shadow contribution unavailable." : "No contributors today.";
  if (ct) ct.innerHTML = `<tr><th>Strategy</th><th>Daily PnL</th><th>Research Wt</th><th>Driver</th></tr>${positive.map(row).join("") || `<tr><td colspan='4'>${emptyMsg}</td></tr>`}`;
  if (dt) dt.innerHTML = `<tr><th>Strategy</th><th>Daily PnL</th><th>Research Wt</th><th>Driver</th></tr>${negative.map(row).join("") || `<tr><td colspan='4'>${emptyMsg}</td></tr>`}`;
}

function renderRiskActionCenter(artifact) {
  const el = document.getElementById("riskActionTable");
  if (!el) return;
  const checks = collectRiskActionCenterChecks(artifact, riskActionFilter);
  el.innerHTML = `<tr><th>Subject</th><th>Scope</th><th>Issue</th><th>Current</th><th>Threshold</th><th>Util./Gap</th><th>Action</th><th>Status</th></tr>` +
    checks.slice(0, 16).map((check) => `<tr>
      <td class="wrap-cell">${escapeHtml(formatIssueSubjectLabel(check, artifact))}</td>
      <td>${humanize(check.scope)}</td>
      <td class="wrap-cell">${humanizeMetricLabel(check.metric, artifact)}</td>
      <td class="col-num">${escapeHtml(formatRiskActionCurrentValue(check))}</td>
      <td class="col-num">${formatRiskActionThresholdCell(check)}</td>
      <td>${formatRiskActionUtilCell(check)}</td>
      <td class="wrap-cell">${escapeHtml(formatRiskActionAction(check))}</td>
      <td class="col-status">${riskActionStatusBadge(check)}</td>
    </tr>`).join("") || `<tr><td colspan="8">No active issues in ${humanize(riskActionFilter)} view.</td></tr>`;
  document.querySelectorAll("#riskActionFilters [data-risk-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.riskFilter === riskActionFilter);
    button.onclick = () => {
      riskActionFilter = button.dataset.riskFilter;
      renderRiskActionCenter(artifact);
    };
  });
}

function renderCommandWatchlistPanels(artifact) {
  const recs = artifact.recommendations || [];
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  const workflowView = deriveWorkflowPresentation(artifact, proposal);
  document.getElementById("commandWatchlist").innerHTML = recs.slice(0, 5).map((rec) => `<p>${statusBadge(rec.priority || "watch")} <strong>${escapeHtml(humanizeUserFacingText(rec.action, artifact))}</strong> — ${escapeHtml(humanizeUserFacingText(rec.rationale, artifact))}</p>`).join("") || emptyState("No watchlist items.");
  const dq = artifact.data_quality || {};
  document.getElementById("commandDataQuality").innerHTML = `
    <p><strong>Active proposal:</strong> ${statusBadge(proposal.status)} ${proposal.detail}</p>
    <p><strong>Missing series:</strong> ${(dq.missing_return_series || []).length || 0}</p>
    <p><strong>Common window:</strong> ${dq.common_portfolio_risk_window_observations || 0} obs</p>
    <p><strong>Governance:</strong> ${humanize(workflowView.workflowStatus, "monitoring")}</p>
    <p><strong>Open decision reviews:</strong> ${countOpenDecisionReviews(artifact, localDecisionEvents)} · Approval policy applies to ${artifact.strategy_count || 0} strategies</p>`;
}

function renderTables(artifact) {
  const strategies = artifact.strategies || [];
  const allocationTable = document.getElementById("allocationTable");
  if (allocationTable) {
    allocationTable.innerHTML = `<tr><th>Strategy</th><th>Alloc.</th></tr>` +
      strategies.filter((s) => s.current_weight > 0).map((s) => `<tr><td><button class="table-link" data-open-strategy="${s.strategy_id}">${s.name}</button></td><td>${pct(s.current_weight || 0)}</td></tr>`).join("");
  }
  const strategyTable = document.getElementById("strategyTable");
  if (strategyTable) {
    const performanceHeader = "<tr><th>#</th><th>Strategy</th><th>Type</th><th>Status</th><th>Current</th><th>Proposed</th><th>Daily PnL</th><th>Daily Ret</th><th>Op. Sharpe</th><th>Historical Sharpe</th><th>Vol</th><th>Current DD</th><th>Model Risk</th><th>Action</th></tr>";
    strategyTable.innerHTML = performanceHeader + strategies.map((s, idx) => {
      const live = s.current_weight > 0;
      const opSharpe = s.since_investment?.sharpe;
      const opSharpeText = opSharpe?.available === false || opSharpe?.value == null
        ? `N/A (${opSharpe?.observations || 0}/${opSharpe?.minimum_observations || "?"} obs)`
        : num(typeof opSharpe === "object" ? opSharpe.value : opSharpe);
      return `<tr class="${live ? "" : "research-only-row"}" data-strategy="${s.strategy_id}">
      <td>${idx + 1}</td><td><button class="table-link" data-open-strategy="${s.strategy_id}"><strong>${s.name}</strong></button></td><td>${s.strategy_type}</td>
      <td>${live ? statusBadge("model allocated") : statusBadge("research only")}</td>
      <td>${pct(s.current_weight || 0)}</td><td>${pct(sessionProposedWeight(s.strategy_id, s.proposed_weight || 0))}</td>
      <td class="${cls(s.daily_pnl || 0)}">${money(s.daily_pnl || 0)}</td>
      <td class="${cls(s.daily_return || 0)}">${pct(s.daily_return || 0, 2)}</td>
      <td>${live ? opSharpeText : "—"}</td>
      <td>${num(s.sharpe)}</td><td>${pct(s.volatility || 0, 1)}</td>
      <td class="negative">${pct(s.current_drawdown || s.max_drawdown || 0, 1)}</td>
      <td>${statusBadge(live ? (s.live_risk_status || s.risk_status) : "not applicable")}</td><td>${statusBadge(s.final_action_after_double_check || s.recommended_action)}</td>
    </tr>`;
    }).join("");
    strategyTable.querySelectorAll("[data-open-strategy]").forEach((button) => button.addEventListener("click", () => {
      openStrategyReview(strategies.find((row) => row.strategy_id === button.dataset.openStrategy), artifact);
      setActiveTab("Strategy Monitor");
    }));
  }

  populateMonitorFilters(strategies);
  const monitorSortValue = (strategy, key) => {
    if (key === "name") return strategy.name || "";
    if (key === "family") return strategy.strategy_type || "";
    if (key === "turnover") return strategy.turnover?.annualized_turnover || 0;
    if (key === "mtd") return strategy.mtd_return || 0;
    if (key === "cost_drag") return strategy.transaction_cost_drag || strategy.turnover?.annualized_cost_drag || 0;
    return strategy[key] ?? 0;
  };
  const sortedStrategies = [...strategies].sort((left, right) => {
    const a = monitorSortValue(left, monitorSort.key);
    const b = monitorSortValue(right, monitorSort.key);
    if (typeof a === "string" || typeof b === "string") {
      return monitorSort.direction === "asc" ? String(a).localeCompare(String(b)) : String(b).localeCompare(String(a));
    }
    return monitorSort.direction === "asc" ? a - b : b - a;
  });
  const sortableHeader = (label, key) => {
    const active = monitorSort.key === key ? ` sorted-${monitorSort.direction}` : "";
    return `<th><button type="button" class="table-sort${active}" data-sort-key="${key}">${label}</button></th>`;
  };
  const monitorHeader = `<tr>${sortableHeader("Strategy", "name")}<th>Family</th><th>Lifecycle</th><th class="col-pct">Current</th><th class="col-pct">Proposed</th><th>Eligibility</th>${sortableHeader("Daily PnL", "daily_pnl")}<th>MTD</th><th>Hist. Sharpe</th><th>Roll. Sharpe</th><th>Vol</th>${sortableHeader("Current DD", "current_drawdown")}<th>Turnover</th><th>Cost Drag</th><th>Model Risk</th><th>Research</th><th class="wrap-cell">Required Action</th></tr>`;
  const monitorTable = document.getElementById("monitorTable");
  if (!monitorTable) return;
  monitorTable.innerHTML = monitorHeader + sortedStrategies.map((s) => {
    const elig = formatEligibilityDisplay(s);
    const live = s.current_weight > 0;
    return `<tr data-strategy="${s.strategy_id}" data-risk="${live ? (s.live_risk_status || s.risk_status) : "not-applicable"}" data-allocated="${live ? "active" : "research"}" data-family="${(s.strategy_type || "").toLowerCase()}" data-action="${(s.final_action_after_double_check || s.recommended_action || "").toLowerCase()}" data-search="${`${s.name} ${s.strategy_type} ${positionSummary(s)}`.toLowerCase()}">
    <td><strong>${s.name}</strong></td>
    <td>${s.strategy_type || "—"}</td>
    <td class="col-status">${statusBadge(live ? "allocated" : "research")}</td>
    <td class="col-pct">${pct(s.current_weight || 0)}</td>
    <td class="col-pct">${pct(sessionProposedWeight(s.strategy_id, s.proposed_weight || 0))}</td>
    <td class="col-status" title="${escapeHtml(elig.detail)}">${statusBadge(elig.label)}</td>
    <td class="col-num ${cls(s.daily_pnl || 0)}">${money(s.daily_pnl || 0)}</td>
    <td class="col-pct ${cls(s.mtd_return || 0)}">${pct(s.mtd_return || 0, 2)}</td>
    <td class="col-num">${num(s.sharpe)}</td>
    <td class="col-num">${num(s.rolling_sharpe)}</td>
    <td class="col-pct">${pct(s.volatility || 0, 1)}</td>
    <td class="col-pct negative">${pct(s.current_drawdown || 0, 1)}</td>
    <td class="col-num">${num(s.turnover?.annualized_turnover, 1)}x</td>
    <td class="col-pct">${pct(s.transaction_cost_drag || s.turnover?.annualized_cost_drag || 0, 2)}</td>
    <td class="col-status">${statusBadge(live ? (s.live_risk_status || s.risk_status) : "not applicable")}</td>
    <td class="col-status">${statusBadge(s.research_quality_status || s.research_status)}</td>
    <td class="wrap-cell">${statusBadge(s.final_action_after_double_check || s.recommended_action || "Review")}</td>
  </tr>`;
  }).join("");
  monitorTable.querySelectorAll("[data-sort-key]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    if (monitorSort.key === key) monitorSort.direction = monitorSort.direction === "asc" ? "desc" : "asc";
    else { monitorSort.key = key; monitorSort.direction = key === "name" ? "asc" : "desc"; }
    renderTables(artifact);
    installStrategyMonitorControls(artifact);
  }));
  monitorTable.querySelectorAll("tr[data-strategy]").forEach((row) => row.addEventListener("click", () => {
    const selected = strategies.find((item) => item.strategy_id === row.dataset.strategy);
    monitorTable.querySelectorAll("tr[data-strategy]").forEach((item) => item.classList.toggle("selected", item === row));
    openStrategyReview(selected, artifact);
  }));
  document.querySelectorAll("[data-open-strategy]").forEach((row) => row.addEventListener("click", (event) => {
    event.stopPropagation();
    const selected = strategies.find((item) => item.strategy_id === row.dataset.openStrategy);
    setActiveTab("Strategy Monitor");
    openStrategyReview(selected, artifact);
    monitorTable.querySelectorAll("tr[data-strategy]").forEach((item) => item.classList.toggle("selected", item.dataset.strategy === selected?.strategy_id));
  }));
}

function populateMonitorFilters(strategies) {
  const familyFilter = document.getElementById("strategyFamilyFilter");
  const actionFilter = document.getElementById("strategyActionFilter");
  if (familyFilter && familyFilter.options.length <= 1) {
    [...new Set(strategies.map((s) => s.strategy_type).filter(Boolean))].forEach((family) => {
      const opt = document.createElement("option");
      opt.value = family.toLowerCase();
      opt.textContent = family;
      familyFilter.appendChild(opt);
    });
  }
  if (actionFilter && actionFilter.options.length <= 1) {
    [...new Set(strategies.map((s) => s.final_action_after_double_check || s.recommended_action).filter(Boolean))].forEach((action) => {
      const opt = document.createElement("option");
      opt.value = action.toLowerCase();
      opt.textContent = action;
      actionFilter.appendChild(opt);
    });
  }
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
  const total = Object.values(proposalSession.weights).reduce((sum, value) => sum + Number(value || 0), 0);
  const cash = 1 - total;
  const totalState = document.getElementById("weightTotalState");
  if (!totalState) return;
  totalState.className = total > 1.00001 ? "negative" : total < 0 ? "negative" : "positive";
  totalState.textContent = `Invested ${pct(total, 1)} | Cash ${pct(cash, 1)}`;
}

function renderAllocationEditor(artifact) {
  const total = Object.values(proposalSession.weights).reduce((sum, value) => sum + Number(value || 0), 0);
  const cash = 1 - total;
  const totalState = document.getElementById("weightTotalState");
  if (totalState) {
    totalState.className = total > 1.00001 ? "negative weight-total-state" : "positive weight-total-state";
    totalState.textContent = `Invested ${pct(total, 1)} · Residual cash ${pct(cash, 1)}`;
  }
  const table = document.getElementById("allocationEditorTable");
  if (!table) return;
  const strategies = uiStrategies(artifact);
  if (!factoryDataReady || !strategies.length) {
    table.innerHTML = "<tr><td colspan='12'>DATA UNAVAILABLE — STRATEGY 21 RESEARCH ALLOCATION requires the US-equity bundle.</td></tr>";
    renderLegacyAllocationReference(artifact);
    return;
  }
  table.innerHTML = "<tr><th>Strategy</th><th>Lifecycle</th><th>Eligibility</th><th>Current</th><th>Proposed</th><th>Change</th><th>Direction</th><th>Trade $</th><th>Est. Cost</th><th>Risk Contrib.</th><th>Action</th><th>Rationale</th></tr>" +
    strategies.map((strategy) => {
      const current = strategy.current_weight || 0;
      const target = proposalSession.weights[strategy.strategy_id] || 0;
      const change = target - current;
      const elig = formatEligibilityDisplay({ ...strategy, proposed_weight: target });
      const disabled = !strategy.allocation_eligibility?.eligible && current === 0;
      const reduceOnly = current > 0 && !strategy.allocation_eligibility?.eligible;
      const maxWeight = reduceOnly ? current : 0.25;
      return `<tr data-strategy-row="${strategy.strategy_id}">
        <td><button class="table-link" data-open-strategy="${strategy.strategy_id}"><strong>${strategy.name}</strong></button></td>
        <td class="col-status">${statusBadge(current > 0 ? "allocated" : "research")}</td>
        <td class="col-status" title="${escapeHtml(elig.detail)}">${statusBadge(elig.label)}</td>
        <td class="col-pct">${pct(current, 1)}</td>
        <td><div class="weight-adj"><button type="button" data-weight-delta="${strategy.strategy_id}" data-delta="-0.005" ${disabled ? "disabled" : ""}>−</button><input class="weight-input" data-weight-id="${strategy.strategy_id}" type="number" min="0" max="${(maxWeight * 100).toFixed(1)}" step="0.1" value="${(target * 100).toFixed(1)}" ${disabled ? "disabled" : ""}>%<button type="button" data-weight-delta="${strategy.strategy_id}" data-delta="0.005" ${disabled || (reduceOnly && target >= current - 1e-6) ? "disabled" : ""}>+</button></div></td>
        <td class="${cls(change)} col-pct">${pct(change, 1)}</td>
        <td class="col-status">${change > 0.0001 ? "Buy" : change < -0.0001 ? "Sell" : "Hold"}</td>
        <td class="col-num ${cls(change)}">${money(change * artifact.initial_capital)}</td>
        <td class="col-num">${money(Math.abs(change) * artifact.initial_capital * 0.0005)}</td>
        <td class="col-pct">${pct(strategy.risk_contribution || 0, 1)}</td>
        <td class="col-status">${statusBadge(strategyActionLabel({ ...strategy, proposed_weight: target }))}</td>
        <td class="wrap-cell">${strategyRationale(strategy)}</td>
      </tr>`;
    }).join("");
  renderLegacyAllocationReference(artifact);
  table.querySelectorAll("[data-weight-id]").forEach((input) => input.addEventListener("input", () => {
    const strategy = strategies.find((s) => s.strategy_id === input.dataset.weightId);
    let val = Math.max(0, Number(input.value || 0) / 100);
    if (strategy && strategy.current_weight > 0 && !strategy.allocation_eligibility?.eligible) val = Math.min(val, strategy.current_weight);
    proposalSession.weights[input.dataset.weightId] = val;
    proposalSession.source = "custom";
    invalidateProposalSimulation();
    updateWeightTotalsOnly();
    refreshProposalStatusViews(artifact);
  }));
  table.querySelectorAll("[data-weight-delta]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.weightDelta;
    const delta = Number(button.dataset.delta || 0);
    const strategy = strategies.find((s) => s.strategy_id === id);
    let next = Math.max(0, (proposalSession.weights[id] || 0) + delta);
    if (strategy && strategy.current_weight > 0 && !strategy.allocation_eligibility?.eligible) next = Math.min(next, strategy.current_weight);
    proposalSession.weights[id] = Math.min(next, 0.25);
    proposalSession.source = "custom";
    invalidateProposalSimulation();
    renderAllocationEditor(artifact);
    refreshProposalStatusViews(artifact);
  }));
  table.querySelectorAll("[data-open-strategy]").forEach((button) => button.addEventListener("click", () => {
    if (factoryDataReady) openResearchLabForStrategy(button.dataset.openStrategy);
    else openStrategyReview(artifact.strategies.find((strategy) => strategy.strategy_id === button.dataset.openStrategy), artifact);
  }));
}

function renderSimulationResult(artifact) {
  const el = document.getElementById("simulationChecks");
  if (!el) return;
  const checks = proposalSession.simulation?.checks || [];
  const gates = proposalSession.simulation?.proposalGates || [];
  const sourceNote = proposalSession.simulation?.source === "python_rebalance_simulation"
    ? "Backend-tested Python simulation."
    : proposalSession.simulation ? "Artifact-embedded official optimizer result." : "Run simulation to refresh checks.";
  const cashSemantics = artifact.factors?.cash_semantics || {};
  const cashHtml = Number.isFinite(proposalSession.simulation?.cashWeight)
    ? `<p>${cashSemantics.residual_cash_display_label || "Unallocated residual cash"}: <strong>${pct(proposalSession.simulation.cashWeight, 1)}</strong> · Treasury-bill / liquidity proxy tracked separately.</p>`
    : "";
  el.innerHTML = `<p class="simulation-source">${sourceNote}</p>${cashHtml}` +
    gates.map((gate) => `<p>${statusBadge(gate.status)} <strong>${humanizeMetricLabel(gate.metric || gate.gate, artifact)}</strong> — ${gate.text || gate.required_action || ""}</p>`).join("") +
    checks.map((check) => `<p>${statusBadge(check.status)} <strong>${humanizeMetricLabel(check.metric, artifact)}</strong> — ${check.text}</p>`).join("") || emptyState("No simulation checks yet.");
  renderAllocationBeforeAfterStrip(artifact);
}

async function runSimulation(artifact) {
  if (proposalIsUnchanged(artifact, proposalSession.weights)) {
    proposalSession.simulation = null;
    refreshProposalStatusViews(artifact);
    const statusEl = document.getElementById("decisionAuthorityStatus");
    if (statusEl) statusEl.textContent = "No allocation change from current weights. Simulation not required.";
    return true;
  }
  let payload = officialSimulationFromArtifact(artifact, proposalSession.weights);
  if (!payload && await ensureSimulationApi(artifact, proposalSession.weights)) {
    try {
      payload = await fetchBackendSimulation(artifact, proposalSession.weights);
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    proposalSession.simulation = null;
    refreshProposalStatusViews(artifact);
    document.getElementById("decisionAuthorityStatus").textContent = "Simulation unavailable. Start scripts/run_workstation_server.py for custom weights or regenerate the dashboard artifact.";
    return false;
  }
  proposalSession.simulation = payload;
  refreshProposalStatusViews(artifact);
  const statusEl = document.getElementById("decisionAuthorityStatus");
  if (statusEl) statusEl.textContent = `Simulation completed (${payload.source}). Turnover ${pct(payload.turnover, 1)}, estimated cost ${money(payload.estimatedCost)}. Human approval is still required; execution remains disabled.`;
  return true;
}

function initializeSimulation(artifact) {
  initProposalSession(artifact);
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
      <section><h4>Why risk remains</h4><p>${factorBreaches.map((check) => `${humanizeMetricLabel(check.metric, artifact)} ${num(check.current_value, 3)} vs limit ${num(check.breach_threshold, 3)}`).join("; ") || "No factor hard breach."} Historical research drawdowns are shown separately and are not live breaches.</p></section>
      <section><h4>Required action</h4><p>Do not add capital simply because a strategy lost. Simulate reductions that lower breached factor exposure, preserve the strategies that offset the selloff, and approve only after the before/after risk and transaction-cost trade-off is documented.</p></section>
    </div>`;
}

function renderRealMatrix(id, rows, factors, mode = "exposure") {
  const el = document.getElementById(id);
  if (!el) return;
  const colWidth = mode === "correlation" ? "minmax(52px, 1fr)" : "minmax(66px, 1fr)";
  el.style.gridTemplateColumns = `minmax(140px, 1.8fr) repeat(${factors.length}, ${colWidth})`;
  const shortLabel = (label) => {
    const text = humanizeFactor(String(label || "").replaceAll("_", " "), activeArtifact);
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
  const strategies = uiStrategies(artifact);
  renderContributorsDetractorsTables(artifact);
  renderRecommendationPanels(typeof ResearchUniverse !== "undefined" && ResearchUniverse.isLegacyProxyMode() ? (artifact.recommendations || []) : []);
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length) {
    renderUsEquityCorrelationMatrix(artifact);
    renderFactorKpiGrid(artifact);
    renderSimulationResult(artifact);
    renderNewsRiskSummary(artifact.news_risk);
    return;
  }
  const factorRows = artifact.factors?.strategy_by_factor_matrix || [];
  const factorNames = (artifact.factors?.factor_contribution_to_risk || []).slice(0, 6).map((row) => row.factor);
  renderRealMatrix("factorMatrix", factorRows, factorNames);
  renderSimulationResult(artifact);
  renderFactorExposureBars("portfolioFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorExposureBars("riskFactorBars", artifact.factors?.portfolio_factor_exposure_current, artifact);
  renderFactorNotes(artifact);
  renderNewsRiskSummary(artifact.news_risk);
  const allocatedIds = new Set(strategies.filter((strategy) => strategy.current_weight > 0).map((strategy) => strategy.strategy_id));
  const universeSelect = document.getElementById("correlationUniverse");
  if (universeSelect) {
    universeSelect.value = correlationUniverse;
    universeSelect.onchange = () => {
      correlationUniverse = universeSelect.value;
      if (correlationUniverse === "LEGACY_PROXY") ResearchUniverse.setPortfolioViewMode("legacy");
      else {
        ResearchUniverse.setPortfolioViewMode("current");
        ResearchUniverse.setCorrelationFilter(correlationUniverse);
      }
      renderResearchModeBanners();
      renderCardsAndMatrices(artifact);
      renderTables(artifact);
      renderWorkstationPanels(artifact);
      refreshProposalStatusViews(artifact);
    };
  }
  renderLegacyCorrelationMatrix(artifact, strategies, allocatedIds);
}

function renderUsEquityCorrelationMatrix(artifact) {
  const universeSelect = document.getElementById("correlationUniverse");
  if (universeSelect) {
    universeSelect.value = correlationUniverse;
    universeSelect.onchange = () => {
      correlationUniverse = universeSelect.value;
      if (correlationUniverse === "LEGACY_PROXY") {
        ResearchUniverse.setPortfolioViewMode("legacy");
        renderResearchModeBanners();
        renderCardsAndMatrices(artifact);
        renderTables(artifact);
        renderWorkstationPanels(artifact);
        refreshProposalStatusViews(artifact);
        return;
      }
      ResearchUniverse.setPortfolioViewMode("current");
      ResearchUniverse.setCorrelationFilter(correlationUniverse);
      renderResearchModeBanners();
      renderCardsAndMatrices(artifact);
    };
  }
  const dataset = ResearchUniverse.correlationDataset(correlationUniverse);
  const ids = dataset.ids || [];
  const names = dataset.names || {};
  const normalizedCorr = ids.map((left) => {
    const out = { strategy: names[left] || left };
    ids.forEach((right) => { out[right] = dataset.matrix?.[left]?.[right] ?? 0; });
    return out;
  });
  const matrixTitle = document.getElementById("correlationMatrixTitle");
  if (matrixTitle) {
    matrixTitle.textContent = `${ResearchUniverse.CORRELATION_LABELS[correlationUniverse] || correlationUniverse} · ${ids.length}-Strategy Correlation Matrix`;
  }
  renderRealMatrix("correlationMatrix", normalizedCorr, ids, "correlation");
  const pairs = dataset.pairs || [];
  document.getElementById("correlationSummary").innerHTML = [
    ["Universe", ResearchUniverse.CORRELATION_LABELS[correlationUniverse] || correlationUniverse],
    ["Strategies", ids.length],
    ["Pair count", Math.max(0, (ids.length * (ids.length - 1)) / 2)],
    ["C2A2_002 / C2A2_020", num(pairs.find((row) => row.strategy_left === "C2A2_002" && row.strategy_right === "C2A2_020")?.daily_net_return_correlation ?? dataset.matrix?.C2A2_002?.C2A2_020 ?? 0, 3)],
    ["C2A2_020 / C2B2_004", num(pairs.find((row) => row.strategy_left === "C2A2_020" && row.strategy_right === "C2B2_004")?.daily_net_return_correlation ?? dataset.matrix?.C2A2_020?.C2B2_004 ?? 0, 3)],
    ["Duplicate decision", "C2A2_002 excluded from Strategy 21 as economic duplicate"],
  ].map(([label, value]) => drawerMetric(label, value)).join("");
  document.getElementById("correlationPairs").innerHTML = "<tr><th>Left Strategy</th><th>Right Strategy</th><th class='col-num'>Daily Corr</th><th class='col-num'>Rolling 60D</th><th class='wrap-cell'>Decision</th></tr>" +
    pairs.map((pair) => `<tr><td>${escapeHtml(pair.strategy_left)}</td><td>${escapeHtml(pair.strategy_right)}</td><td class="col-num">${num(pair.daily_net_return_correlation, 3)}</td><td class="col-num">${pair.rolling_60d_correlation == null ? "N/A" : num(pair.rolling_60d_correlation, 3)}</td><td class="wrap-cell">${escapeHtml(pair.duplicate_decision || pair.overlap_note || "Review overlap")}</td></tr>`).join("") ||
    ids.map((left, i) => ids.slice(i + 1).map((right) => `<tr><td>${escapeHtml(names[left] || left)}</td><td>${escapeHtml(names[right] || right)}</td><td class="col-num">${num(dataset.matrix?.[left]?.[right] ?? 0, 3)}</td><td class="col-num">N/A</td><td class="wrap-cell">Pairwise research correlation</td></tr>`).join("")).join("");
}

function renderLegacyCorrelationMatrix(artifact, strategies, allocatedIds) {
  const corrRowsAll = artifact.correlation?.matrix || [];
  const corrRows = corrRowsAll;
  const corrNames = corrRows.map((row) => row.strategy_id);
  const normalizedCorr = corrRows.map((row) => {
    const out = { strategy: row.name };
    row.values.forEach((value) => {
      if (corrNames.includes(value.strategy_id)) out[value.strategy_id] = value.correlation;
    });
    return out;
  });
  const matrixTitle = document.getElementById("correlationMatrixTitle");
  if (matrixTitle) {
    matrixTitle.textContent = `LEGACY PROXY FACTOR REFERENCE · ${corrRows.length}-Strategy Correlation Matrix`;
  }
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
  document.getElementById("correlationPairs").innerHTML = "<tr><th>Left Strategy</th><th>Right Strategy</th><th class='col-num'>Correlation</th><th class='col-status'>Status</th><th class='wrap-cell'>Allocation Read</th></tr>" +
    [...(corrSummary.breaches || []), ...(corrSummary.hedge_relationships || [])].map((pair) => `<tr><td>${pair.left_name}</td><td>${pair.right_name}</td><td class="col-num ${pair.correlation >= pair.limit ? "negative" : "positive"}">${num(pair.correlation)}</td><td class="col-status">${statusBadge(pair.status)}</td><td class="wrap-cell">${pair.correlation > 0 ? "Compare research quality; block or redesign the weaker duplicate." : "Validate hedge stability, stress behavior, carry cost, and basis risk."}</td></tr>`).join("");
  document.getElementById("riskContribution").innerHTML = (artifact.factors?.factor_contribution_to_risk || []).slice(0, 8).map((row) => `<div><span>${humanizeFactor(row.factor, artifact)}</span><div class="bar"><span style="width:${clamp(row.risk_share * 100, 2, 100)}%"></span></div><strong>${pct(row.risk_share, 1)}</strong></div>`).join("");
}

function renderStaticTables(artifact) {
  document.getElementById("scenarioTable").innerHTML = "<tr><th>Scenario</th><th>Estimated Impact</th><th>Status</th><th>Main Drivers</th></tr>" +
    (artifact.factors?.scenario_shock_table || []).map((row) => `<tr><td>${row.scenario}</td><td class="${cls(row.estimated_portfolio_impact || 0)}">${pct(row.estimated_portfolio_impact || 0, 2)}</td><td>${statusBadge(row.risk_status)}</td><td>${(row.drivers || []).slice(0, 3).map((driver) => humanizeFactor(driver.factor, artifact)).join(" / ")}</td></tr>`).join("");
  const exposureMap = artifact.factors?.portfolio_factor_exposure_current || {};
  document.getElementById("factorLimitAlerts").innerHTML = (artifact.risk_limits?.factors?.checks || []).filter((check) => check.status !== "ok" && check.status !== "not_modeled").map((check) => {
    const card = formatFactorLimitCard(check, exposureMap, artifact);
    return `<p><span class="badge ${card.statusClass}">${escapeHtml(card.statusLabel)}</span> <strong>${escapeHtml(card.label)}</strong><br>${escapeHtml(card.direction)} · |Loading| / Limit ${escapeHtml(card.loadingLimitText)} · ${escapeHtml(card.utilizationText)}. ${escapeHtml(check.action || "")}</p>`;
  }).join("");

  const marketRows = artifact.market_monitor || [];
  document.getElementById("marketTable").innerHTML = "<tr><th>Market</th><th class='col-num'>Current</th><th class='col-pct'>Daily Move</th><th class='col-status'>Status</th><th class='interpretation-cell'>Risk Interpretation</th></tr>" +
    marketRows.map((row) => `<tr><td>${row.ticker}</td><td class="col-num">${Number(row.last || 0).toFixed(2)}</td><td class="col-pct ${cls(row.daily_return || 0)}">${pct(row.daily_return || 0, 2)}</td><td class="col-status">${statusBadge(row.status)}</td><td class="interpretation-cell">${row.risk_interpretation}</td></tr>`).join("");
  document.getElementById("newsTable").innerHTML = "<tr><th>Severity</th><th>Source</th><th>Published</th><th>Headline</th><th>Affected</th><th>Relevance</th><th>Review</th></tr>" +
    (artifact.news_risk?.items || []).map((item) => {
      const interpretation = item.risk_interpretation || "";
      const headline = item.headline || "";
      const cleanInterpretation = interpretation.startsWith(headline) ? interpretation.slice(headline.length).replace(/^[\s:—-]+/, "") : interpretation;
      return `<tr>
        <td class="col-status">${statusBadge(item.severity)}</td>
        <td>${escapeHtml(item.source || artifact.news_risk?.source || "proxy")}</td>
        <td>${escapeHtml(item.published_at || item.as_of || "n/a")}</td>
        <td class="wrap-cell">${escapeHtml(headline)}</td>
        <td class="wrap-cell">${escapeHtml((item.affected_strategies || item.affected_factors || [item.topic]).filter(Boolean).join(", ") || "General monitor")}</td>
        <td class="wrap-cell">${escapeHtml(cleanInterpretation || item.topic || "Monitor")}</td>
        <td class="col-status">${item.human_review ? "Required" : "Monitor"}</td>
      </tr>`;
    }).join("");

  const selected = artifact.strategies?.[0];
  document.getElementById("walkForwardTable").innerHTML = "<tr><th>Train</th><th>Test</th><th>Train Sharpe</th><th>Test Sharpe</th><th>Test Return</th><th>Test Max DD</th></tr>" +
    (selected?.walk_forward?.windows || []).slice(-12).map((window) => `<tr><td>${window.train_start} → ${window.train_end}</td><td>${window.test_start} → ${window.test_end}</td><td>${num(window.train_sharpe)}</td><td>${num(window.test_sharpe)}</td><td class="${cls(window.test_return || 0)}">${pct(window.test_return || 0, 2)}</td><td class="negative">${pct(window.test_max_drawdown || 0, 2)}</td></tr>`).join("");
  renderLiteratureStrategies(artifact.literature_strategy_backtests || {});
  renderCandidateStrategies();
  renderReplicationClone(artifact.replication_clone || {});
  const decisionFootnote = document.getElementById("decisionAuthorityStatus");
  if (decisionFootnote && !proposalSession.simulation) {
    decisionFootnote.textContent = "Human approval does not authorize execution. Simulate proposal before recording a decision.";
  }
}

function renderWorkflow(artifact) {
  const gateBadge = (status) => statusBadge(status || "pending");
  const workflowFilter = typeof ResearchUniverse !== "undefined" ? ResearchUniverse.getWorkflowFilter() : "US_EQUITY";
  const rows = typeof ResearchUniverse !== "undefined" && workflowFilter !== "LEGACY_REFERENCE" && !ResearchUniverse.isLegacyProxyMode()
    ? ResearchUniverse.workflowRows(workflowFilter)
    : (artifact.strategies || []).map((row) => ({ ...row, research_group: "LEGACY_PROXY" }));
  document.getElementById("workflowTable").innerHTML = "<tr><th>Strategy</th><th>Hypothesis</th><th>Data</th><th>Signal</th><th>Backtest</th><th>Cost</th><th>IC/Decile</th><th>Risk Review</th><th>Duplicate</th><th>Composite</th><th>Shadow</th><th>Approval</th><th>Next Action</th></tr>" +
    rows.map((s) => {
      const wf = s.workflow_gates || {};
      const elig = formatEligibilityDisplay(s);
      const archived = s.research_group === "ARCHIVED" || s.research_group === "DUPLICATE";
      return `<tr class="table-link-row" data-open-research-lab="${escapeHtml(s.strategy_id)}">
        <td><strong>${escapeHtml(s.name)}</strong><small>${s.current_weight > 0 ? `Research ${pct(s.current_weight)}` : humanize(s.research_group || "research")}</small></td>
        <td class="wrap-cell">${escapeHtml(s.hypothesis || "—")}</td>
        <td>${gateBadge(wf.data_validation || s.evidence_status)}</td>
        <td>${gateBadge(wf.signal || s.signal_status)}</td>
        <td>${gateBadge(wf.backtest || "complete")}</td>
        <td>${gateBadge("complete")}</td>
        <td>${gateBadge(archived ? "archived" : "complete")}</td>
        <td>${gateBadge(wf.risk_limits || s.research_quality_status || "research review")}</td>
        <td>${gateBadge(s.research_group === "DUPLICATE" ? "economic duplicate" : "cleared")}</td>
        <td>${gateBadge(wf.composite_eligibility || "not eligible")}</td>
        <td>${gateBadge(wf.shadow_eligibility || "not eligible")}</td>
        <td>${s.human_approval_required ? gateBadge("required") : gateBadge("not required")}</td>
        <td>${statusBadge(s.final_action_after_double_check || s.recommended_action || "review")}</td>
      </tr>`;
    }).join("");
  const workflowBanner = document.getElementById("workflowFilters");
  if (workflowBanner) {
    workflowBanner.innerHTML = `
      <label>Pipeline view
        <select id="workflowPipelineFilter">
          <option value="US_EQUITY">US-Equity Research Pipeline</option>
          <option value="LEGACY_REFERENCE">Legacy Proxy Reference</option>
        </select>
      </label>
      <span class="workflow-filter-chip">Hypothesis</span>
      <span class="workflow-filter-chip">Baseline backtest</span>
      <span class="workflow-filter-chip">Cost analysis</span>
      <span class="workflow-filter-chip">IC / decile</span>
      <span class="workflow-filter-chip">Duplicate review</span>
      <span class="workflow-filter-chip">Composite eligibility</span>
      <span class="workflow-filter-chip">Shadow eligibility</span>`;
    const select = document.getElementById("workflowPipelineFilter");
    if (select) {
      select.value = workflowFilter;
      select.onchange = () => {
        const value = select.value;
        if (value === "LEGACY_REFERENCE") ResearchUniverse.setPortfolioViewMode("legacy");
        else ResearchUniverse.setPortfolioViewMode("current");
        ResearchUniverse.setWorkflowFilter(value);
        renderResearchModeBanners();
        renderWorkflow(artifact);
      };
    }
  }
  document.querySelectorAll("#workflowTable [data-open-research-lab]").forEach((row) => {
    row.addEventListener("click", () => openResearchLabForStrategy(row.dataset.openResearchLab));
  });
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
  document.getElementById("headerRegime")?.remove();
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
  const proposed = sessionProposedWeight(strategy.strategy_id, strategy.proposed_weight || 0);
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
    weightInput.value = Number(proposalSession.weights[strategy.strategy_id] ?? proposed).toFixed(4);
    weightInput.disabled = !strategy.allocation_eligibility?.eligible && current === 0;
  }
  renderDrawerView(strategy, activeDrawerView, artifact);
}

function resetDrawerView() {
  activeDrawerView = "overview";
  document.querySelectorAll("#drawerTabs .drawer-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerView === "overview");
  });
}

function installDrawerWeightControls(artifact) {
  const applyWeight = async (delta = 0) => {
    if (!activeStrategy) return;
    const input = document.getElementById("drawerWeightInput");
    const base = Number(input?.value || sessionProposedWeight(activeStrategy.strategy_id, activeStrategy.proposed_weight || 0));
    const next = Math.max(0, Math.min(0.25, base + delta));
    proposalSession.weights[activeStrategy.strategy_id] = next;
    proposalSession.source = "custom";
    if (input) input.value = next.toFixed(4);
    invalidateProposalSimulation();
    setActiveTab("Allocation & Rebalance");
    renderAllocationEditor(artifact);
    refreshProposalStatusViews(artifact);
  };
  document.getElementById("drawerWeightUp")?.addEventListener("click", () => applyWeight(0.01));
  document.getElementById("drawerWeightDown")?.addEventListener("click", () => applyWeight(-0.01));
  document.getElementById("drawerApplyWeight")?.addEventListener("click", async () => {
    if (!activeStrategy) return;
    const input = document.getElementById("drawerWeightInput");
    const next = Math.max(0, Math.min(0.25, Number(input?.value || 0)));
    proposalSession.weights[activeStrategy.strategy_id] = next;
    proposalSession.source = "custom";
    invalidateProposalSimulation();
    setActiveTab("Allocation & Rebalance");
    renderAllocationEditor(artifact);
    refreshProposalStatusViews(artifact);
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

function drawerBodyMessage(message, tone = "status-muted") {
  return `<div class="drawer-callout ${tone}"><p>${escapeHtml(message)}</p></div>`;
}

function renderDrawerView(strategy, view, artifact = activeArtifact) {
  if (!strategy) return;
  activeDrawerView = view;
  document.querySelectorAll("#drawerTabs .drawer-tab").forEach((button) => button.classList.toggle("active", button.dataset.drawerView === view));
  const content = document.getElementById("drawerBody");
  if (!content) return;
  const needsSeries = view === "overview" || view === "performance";
  const paint = (resolvedStrategy) => {
    content.innerHTML = `<p class="status-muted drawer-loading">Loading ${escapeHtml(view)}…</p>`;
    try {
      renderDrawerViewBody(resolvedStrategy, view, artifact, content);
    } catch (error) {
      console.error("Drawer render failed:", error);
      content.innerHTML = drawerBodyMessage(`Unable to render ${view} view. ${error?.message || "See console for details."}`, "negative");
    }
  };
  if (needsSeries && !strategy.risk_packet?.chart_series) {
    content.innerHTML = `<p class="status-muted drawer-loading">Loading ${escapeHtml(view)}…</p>`;
    void ensureStrategyDetail(strategy, artifact).then((detailed) => {
      activeStrategy = detailed;
      paint(detailed);
    });
    return;
  }
  paint(strategy);
}

function renderDrawerViewBody(strategy, view, artifact, content) {
  const packet = strategy.risk_packet || {};
  const summary = packet.summary_statistics || {};
  const drawdown = packet.drawdown_behavior || {};
  const tail = packet.tail_risk || {};
  const walk = strategy.walk_forward || {};
  const live = strategy.current_weight > 0;
  const elig = formatEligibilityDisplay(strategy);
  let html = "";
  if (view === "overview") {
      html = `<div class="drawer-metric-grid">
      ${drawerMetric("Current allocation", pct(strategy.current_weight || 0))}
      ${drawerMetric("Proposed allocation", pct(sessionProposedWeight(strategy.strategy_id, strategy.proposed_weight || 0)))}
      ${drawerMetric("Eligibility", elig.label)}
      ${drawerMetric("Model risk", live ? humanize(strategy.live_risk_status || strategy.risk_status) : "Not applicable")}
      ${drawerMetric("Research quality", humanize(strategy.research_quality_status || strategy.research_status))}
      ${drawerMetric("Recommended action", strategy.final_action_after_double_check || strategy.recommended_action)}
      ${drawerMetric("Rolling Sharpe", num(strategy.rolling_sharpe), cls(strategy.rolling_sharpe || 0))}
      ${drawerMetric("Volatility", pct(strategy.volatility || summary.annual_volatility || 0, 1))}
      ${drawerMetric("Current drawdown", pct(strategy.current_drawdown || drawdown.current_drawdown || 0, 1), "negative")}
      ${drawerMetric("Turnover", `${num(strategy.turnover?.annualized_turnover, 1)}x`)}
      ${drawerMetric("Cost drag", pct(strategy.transaction_cost_drag || strategy.turnover?.annualized_cost_drag || 0, 2))}
    </div>
    ${drawerChartBlock("Net cumulative performance", "drawerOverviewCumCanvas", '<span class="legend-dot net"></span> Net')}
    ${drawerChartBlock("Drawdown", "drawerOverviewDdCanvas", '<span class="legend-dot drawdown"></span> Drawdown')}
    <p class="status-muted">${elig.detail}</p>`;
    } else if (view === "performance") {
      html = `${drawerChartBlock("Gross vs net cumulative return", "drawerPerfGrossNetCanvas", '<span class="legend-dot gross"></span> Gross <span class="legend-dot net"></span> Net')}
      ${drawerChartBlock("Drawdown", "drawerPerfDrawdownCanvas", '<span class="legend-dot drawdown"></span> Drawdown')}
      ${drawerChartBlock("Rolling Sharpe (63D)", "drawerPerfRollingSharpeCanvas", '<span class="legend-dot sharpe"></span> 63D rolling')}
      <div class="drawer-metric-grid">
        ${drawerMetric("Gross Sharpe", num(strategy.gross_metrics?.sharpe || summary.sharpe))}
        ${drawerMetric("Net Sharpe", num(strategy.net_metrics?.sharpe || summary.sharpe))}
        ${drawerMetric("Max drawdown", pct(drawdown.max_drawdown || 0, 1), "negative")}
        ${drawerMetric("OOS windows", String(walk.number_of_windows || 0))}
      </div>`;
    } else if (view === "risk") {
      const factors = strategy.factor_exposure?.latest || {};
      const maxFactor = Math.max(...Object.values(factors).map((v) => Math.abs(v)), 0.01);
      html = `<div class="drawer-metric-grid">
      ${drawerMetric("VaR 99%", pct(tail.var_99 || 0, 2), "negative")}
      ${drawerMetric("ES 95%", pct(tail.expected_shortfall_95 || 0, 2), "negative")}
      ${drawerMetric("Tail 2σ days", String(tail.left_tail_2sigma_count || 0))}
      ${drawerMetric("Risk contribution", pct(strategy.risk_contribution || 0, 1))}
      ${drawerMetric("Corr. to portfolio", num(packet.comparison_vs_benchmark?.correlation))}
      ${drawerMetric("Avg |corr| others", num(packet.comparison_vs_other_strategies?.average_abs_correlation_to_others))}
    </div><h4>Factor exposure</h4><div class="mini-bars">${Object.entries(factors).slice(0, 6).map(([label, value]) => `<div><span>${humanizeFactor(label, artifact)}</span><div class="bar"><span style="width:${Math.min(100, Math.abs(value) / maxFactor * 100)}%"></span></div><strong>${num(value)}</strong></div>`).join("")}</div>`;
    } else if (view === "evidence") {
      html = `<p><strong>Hypothesis:</strong> ${strategy.hypothesis || "—"}</p>
      <p><strong>Data source:</strong> ${strategy.data_source || strategy.evidence_status || "—"}</p>
      <p><strong>Backtest period:</strong> ${strategy.backtest_evidence?.years?.toFixed(1) || "0"} years · ${summary.observations || 0} obs</p>
      <p><strong>Walk-forward:</strong> ${walk.number_of_windows || 0} windows · avg OOS Sharpe ${num(walk.average_test_sharpe)}</p>
      <p><strong>Assumptions:</strong> ${strategy.bias_controls?.lookahead_bias || "—"}</p>
      <p><strong>Limitations:</strong> ${(strategy.limitations || [strategy.bias_controls?.survivorship_bias]).filter(Boolean).join("; ") || "See research lab."}</p>`;
    } else if (view === "limits") {
      const checks = [...(strategy.risk_limit_checks || []), ...(strategy.research_quality_checks || [])];
      html = checks.length
        ? `<div class="table-viewport short"><div class="table-scroll"><table class="data-table dense"><tr><th>Metric</th><th>Current</th><th>Threshold</th><th>Util.</th><th>Status</th><th>Action</th></tr>
      ${checks.map((check) => `<tr><td>${humanizeMetricLabel(check.metric, artifact)}</td><td>${typeof check.current_value === "number" ? num(check.current_value, 3) : humanize(check.current_value)}</td><td>${typeof check.breach_threshold === "number" ? num(check.breach_threshold, 3) : humanize(check.breach_threshold)}</td><td>${check.utilization != null ? utilizationBar(check.utilization, check.status) : "—"}</td><td>${statusBadge(check.status)}</td><td class="wrap-cell">${check.action || check.required_action || "—"}</td></tr>`).join("")}</table></div></div>`
        : drawerBodyMessage("No configured risk-limit or research-quality checks for this strategy.");
    } else if (view === "decision") {
      html = `<div class="drawer-callout">${statusBadge(strategy.final_action_after_double_check)}<p>${strategyRationale(strategy)}</p></div>
      <label>Decision<textarea id="drawerDecisionNote" rows="3" placeholder="Reviewer notes"></textarea></label>
      <div class="decision-buttons compact-decision">
        <button class="modify compact-btn" data-decision="Keep">Keep</button>
        <button class="modify compact-btn" data-decision="Watch">Watch</button>
        <button class="modify compact-btn" data-decision="Reduce">Reduce</button>
        <button class="modify compact-btn" data-decision="Human Review">Human Review</button>
      </div>
      <p class="decision-footnote">Decisions recorded locally only. No execution authorized.</p>`;
  } else {
    html = drawerBodyMessage(`Unknown drawer view: ${view}.`);
  }
  content.innerHTML = html;
  if (view === "overview") {
    requestAnimationFrame(() => paintDrawerViewCharts(strategy, "overview", artifact));
  } else if (view === "performance") {
    requestAnimationFrame(() => paintDrawerViewCharts(strategy, "performance", artifact));
  }
}

function installStrategyMonitorControls(artifact) {
  const controls = ["strategySearch", "strategyAllocationFilter", "strategyRiskFilter", "strategyFamilyFilter", "strategyActionFilter"].map((id) => document.getElementById(id)).filter(Boolean);
  const apply = () => {
    const search = document.getElementById("strategySearch")?.value.trim().toLowerCase() || "";
    const allocation = document.getElementById("strategyAllocationFilter")?.value || "all";
    const risk = document.getElementById("strategyRiskFilter")?.value || "all";
    const family = document.getElementById("strategyFamilyFilter")?.value || "all";
    const action = document.getElementById("strategyActionFilter")?.value || "all";
    let visible = 0;
    document.querySelectorAll("#monitorTable tr[data-strategy]").forEach((row) => {
      const show = (!search || row.dataset.search.includes(search))
        && (allocation === "all" || row.dataset.allocated === allocation)
        && (risk === "all" || row.dataset.risk === risk)
        && (family === "all" || row.dataset.family === family)
        && (action === "all" || row.dataset.action.includes(action));
      row.hidden = !show;
      visible += show ? 1 : 0;
    });
    const allocated = artifact.strategies.filter((strategy) => strategy.current_weight > 0).length;
    const openReviews = countOpenDecisionReviews(artifact, localDecisionEvents);
    document.getElementById("monitorSummary").innerHTML = `<span><strong>${visible}</strong> visible</span><span><strong>${allocated}</strong> allocated</span><span><strong>${openReviews}</strong> open reviews</span>`;
  };
  controls.forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", apply));
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

function openStrategyReview(strategy, artifact) {
  if (!strategy) return;
  activeStrategy = strategy;
  activeArtifact = artifact;
  activeDrawerView = "overview";
  const drawer = document.getElementById("strategyDrawer");
  document.getElementById("drawerStrategyId").textContent = strategy.strategy_id;
  document.getElementById("drawerStrategyName").textContent = strategy.name;
  document.getElementById("drawerStrategyMeta").textContent = `${strategy.strategy_type} · ${strategy.backtest_evidence?.data_source || "proxy data"} · ${positionSummary(strategy)}`;
  drawer?.classList.remove("collapsed");
  renderDrawerView(strategy, "overview", artifact);
}

function installStrategyDrawerControls(artifact) {
  document.getElementById("closeStrategyDrawer")?.addEventListener("click", () => {
    document.getElementById("strategyDrawer")?.classList.add("collapsed");
    resetDrawerView();
  });
  document.querySelectorAll("#drawerTabs .drawer-tab").forEach((button) => {
    button.addEventListener("click", () => renderDrawerView(activeStrategy, button.dataset.drawerView, activeArtifact));
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function loadLocalDecisionEvents() {
  try {
    localDecisionEvents = JSON.parse(localStorage.getItem("riskManagerDecisionEvents") || "[]");
  } catch {
    localDecisionEvents = [];
  }
}

function renderReportDecisionLog(artifact) {
  renderDecisionLog(artifact, true);
}

function renderDecisionLog(artifact, full = false) {
  const workflowEvents = artifact.decision_workflow?.audit_trail || [];
  const events = [...workflowEvents, ...localDecisionEvents].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const header = full
    ? "<tr><th>Time</th><th>Actor</th><th>Event</th><th>Decision</th><th>Note</th><th>Conditions</th><th>Execution authorized</th></tr>"
    : "<tr><th>Time</th><th>Actor</th><th>Event</th><th>Note</th></tr>";
  document.getElementById("decisionLog").innerHTML = header +
    events.map((event) => full
      ? `<tr>
        <td>${escapeHtml(event.timestamp)}</td>
        <td>${escapeHtml(event.actor)}</td>
        <td>${statusBadge(event.event)}</td>
        <td>${escapeHtml(event.event)}</td>
        <td class="wrap-cell">${escapeHtml(event.note)}</td>
        <td class="wrap-cell">${escapeHtml(event.conditions || "—")}</td>
        <td>${event.execution_authorized ? "Yes" : "No"}</td>
      </tr>`
      : `<tr><td>${escapeHtml(event.timestamp)}</td><td>${escapeHtml(event.actor)}</td><td>${statusBadge(event.event)}</td><td class="wrap-cell">${escapeHtml(event.note)}</td></tr>`).join("");
}

async function recordDecision(artifact, action) {
  const reviewer = document.getElementById("decisionReviewer").value.trim()
    || document.getElementById("reportDecisionReviewer")?.value?.trim()
    || "";
  const note = document.getElementById("decisionNote").value.trim()
    || document.getElementById("reportDecisionNote")?.value?.trim()
    || "";
  if (!reviewer || !note) {
    document.getElementById("decisionAuthorityStatus").textContent = "Reviewer and decision note are required before recording a human decision.";
    return;
  }
  const unchanged = proposalIsUnchanged(artifact, proposalSession.weights);
  if (!proposalSession.simulation && !unchanged) {
    const simulated = await runSimulation(artifact);
    if (!simulated || !proposalSession.simulation) {
      document.getElementById("decisionAuthorityStatus").textContent = "Cannot record a decision until a valid simulation is available.";
      return;
    }
  }
  const blockers = (proposalSession.simulation?.checks || []).filter((check) => check.status === "breach");
  const gateBlockers = (proposalSession.simulation?.proposalGates || []).filter((gate) => gate.status === "breach");
  if (action === "Approved for execution review" && (blockers.length || gateBlockers.length)) {
    document.getElementById("decisionAuthorityStatus").textContent = `Approval blocked by ${blockers.length + gateBlockers.length} hard simulation or proposal gate checks. Modify or reject the proposal. Human approval does not authorize execution.`;
    return;
  }
  const event = {
    timestamp: new Date().toISOString(),
    actor: reviewer,
    event: action,
    note,
    conditions: document.getElementById("decisionConditions")?.value?.trim() || document.getElementById("reportDecisionConditions")?.value?.trim() || "",
    execution_authorized: false,
    simulated_weights: proposalSession.weights,
    simulation: proposalSession.simulation ? {
      turnover: proposalSession.simulation.turnover,
      estimated_cost: proposalSession.simulation.estimatedCost,
      hard_breaches: blockers.map((check) => check.metric),
    } : null,
  };
  localDecisionEvents.push(event);
  localStorage.setItem("riskManagerDecisionEvents", JSON.stringify(localDecisionEvents));
  renderDecisionLog(artifact, true);
  renderDailyReport(artifact);
  document.getElementById("decisionAuthorityStatus").textContent = `${action} recorded by ${reviewer}. No trade was executed; execution authorization remains disabled.`;
}

function latestHumanDecision() {
  return localDecisionEvents.at(-1) || null;
}

function reportNavEstimate(artifact) {
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length) {
    const model = ResearchUniverse.dailyReportModel();
    const composite = ResearchUniverse.compositeItem()?.backtest || {};
    const cum = composite.net_metrics?.cumulative_return ?? 0;
    const daily = model.intraday_estimate?.daily_return;
    return {
      nav: daily == null ? null : artifact.initial_capital * (1 + cum),
      dailyPnl: daily == null ? null : daily * artifact.initial_capital,
      cumPnl: cum * artifact.initial_capital,
      cumReturn: cum,
      dailyReturn: daily,
      pnlLabel: model.pnl_label || "Unavailable",
    };
  }
  const marks = artifact.intraday_marks || {};
  const cum = metricNumeric(operatingPnlMetric(artifact, "cumulative_return")) ?? artifact.portfolio_series?.cumulative_return?.at(-1) ?? 0;
  const daily = metricNumeric(operatingPnlMetric(artifact, "daily_return")) ?? artifact.portfolio_series?.returns?.at(-1) ?? 0;
  const nav = marks.estimated_model_nav ?? artifact.initial_capital * (1 + cum);
  const dailyPnl = marks.estimated_intraday_pnl ?? daily * artifact.initial_capital;
  return { nav, dailyPnl, cumPnl: cum * artifact.initial_capital, cumReturn: cum, dailyReturn: daily, pnlLabel: "Proxy estimate" };
}

function renderReportStatusStrip(artifact) {
  const el = document.getElementById("reportStatusStrip");
  if (!el) return;
  const usingResearch = typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length;
  if (usingResearch) {
    const model = ResearchUniverse.dailyReportModel();
    const hist = model.historical_metrics || {};
    el.innerHTML = `
      <span>Report date <strong>${model.report_date || "n/a"}</strong></span>
      <span>Market data <strong>${escapeHtml(String(model.latest_market_data))}</strong></span>
      <span>Position date <strong>${escapeHtml(String(model.latest_position_date || "n/a"))}</strong></span>
      <span>Coverage <strong>${escapeHtml(String(model.coverage))}</strong></span>
      <span>Strategy 21 <strong>${escapeHtml(model.strategy_21_status || "RESEARCH COMPOSITE")}</strong></span>
      <span>Historical net <strong>${hist.cumulative_return == null ? "N/A" : pct(hist.cumulative_return, 1)}</strong></span>
      <span>Authoritative PnL <strong class="warning-text">${escapeHtml(model.pnl_label || "Unavailable")}</strong></span>
      <span>Execution <strong>LIVE — NOT AVAILABLE</strong></span>`;
    return;
  }
  const proxyState = deriveCanonicalProxyDataState(artifact);
  const est = reportNavEstimate(artifact);
  const openReviews = countOpenDecisionReviews(artifact, localDecisionEvents);
  const issueCounts = countIssueCategories(artifact);
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  el.innerHTML = `
    <span>Report date <strong>${artifact.as_of_date || "n/a"}</strong></span>
    <span>Current Model NAV <strong>${money(est.nav)}</strong></span>
    <span>Daily PnL <strong class="${cls(est.dailyReturn)}">${money(est.dailyPnl)}</strong></span>
    <span>Operating PnL <strong class="${cls(est.cumReturn)}">${money(est.cumPnl)}</strong></span>
    <span>Proposal <strong>${escapeHtml(proposal.status)}</strong></span>
    <span>Current-model issues <strong>${issueCounts.current_model_issues}</strong></span>
    <span>Breached controls <strong class="${issueCounts.breached_controls ? "negative" : ""}">${issueCounts.breached_controls}</strong></span>
    <span>Research quality <strong>${issueCounts.research_quality}</strong></span>
    <span>Data quality <strong>${issueCounts.data_quality}</strong></span>
    <span>Governance <strong>${issueCounts.governance}</strong></span>
    <span>Open reviews <strong>${openReviews}</strong></span>
    <span>Data state <strong class="${proxyState.tone || ""}">${proxyState.label}</strong></span>
    <span>Execution <strong>Not authorized</strong></span>`;
}

function renderReportWorkflow(artifact) {
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  const workflowView = deriveWorkflowPresentation(artifact, proposal);
  document.getElementById("governanceFlow").innerHTML = workflowView.stages.map((stage) => `
    <div class="governance-stage">
      <strong>${stage.title}</strong>
      ${statusBadge(stage.statusLabel || stage.status)}
      <span>Owner: ${escapeHtml(stage.owner || "n/a")}</span>
      <span>Next: ${escapeHtml(stage.next || "Awaiting prior stage")}</span>
    </div>`).join("");
  const lastDecision = latestHumanDecision();
  const humanDecisionLabel = proposal.status === "No rebalance proposed"
    ? (lastDecision?.event || "Monitoring acknowledgement only")
    : (lastDecision?.event || "Not recorded");
  document.getElementById("reportHumanDecision").innerHTML = `
    <p><strong>Proposal status:</strong> ${statusBadge(proposal.status)} — ${proposal.detail}</p>
    <p><strong>Human approval status:</strong> ${escapeHtml(humanDecisionLabel)}</p>
    <p><strong>Execution authorization:</strong> Not authorized</p>
    <label>Reviewer<input id="reportDecisionReviewer" placeholder="Name or role" value="${escapeHtml(document.getElementById("decisionReviewer")?.value || "")}"></label>
    <label>Decision
      <select id="reportDecisionAction">
        <option value="Approved for execution review">Approve</option>
        <option value="Modification requested">Modify</option>
        <option value="Proposal rejected">Reject</option>
      </select>
    </label>
    <label>Rationale<textarea id="reportDecisionNote" rows="3" placeholder="Document rationale and conditions"></textarea></label>
    <label>Conditions<input id="reportDecisionConditions" placeholder="Optional approval conditions"></label>
    <label>Next monitoring action<input id="reportDecisionFollowUp" placeholder="What to monitor next"></label>
    <div class="decision-buttons compact-decision">
      <button type="button" class="approve compact-btn" id="reportRecordDecision">Record Decision</button>
    </div>`;
  document.getElementById("reportRecordDecision")?.addEventListener("click", () => {
    document.getElementById("decisionReviewer").value = document.getElementById("reportDecisionReviewer").value;
    document.getElementById("decisionNote").value = [
      document.getElementById("reportDecisionNote").value,
      document.getElementById("reportDecisionConditions").value ? `Conditions: ${document.getElementById("reportDecisionConditions").value}` : "",
      document.getElementById("reportDecisionFollowUp").value ? `Follow-up: ${document.getElementById("reportDecisionFollowUp").value}` : "",
    ].filter(Boolean).join(" | ");
    recordDecision(artifact, document.getElementById("reportDecisionAction").value).then(() => renderDailyReport(artifact));
  });
}

function renderReportIssuesTable(artifact) {
  const el = document.getElementById("reportIssuesTable");
  if (!el) return;
  const checks = groupedCurrentPortfolioIssues(artifact).concat(groupedCanonicalIssues(artifact, "research")).slice(0, 20);
  el.innerHTML = `<tr><th>Subject</th><th>Scope</th><th>Issue</th><th>Current</th><th>Threshold</th><th>Severity</th><th>Action</th><th>Review</th></tr>` +
    checks.map((check) => `<tr>
      <td class="wrap-cell">${escapeHtml(formatIssueSubjectLabel(check, artifact))}</td>
      <td>${humanize(check.scope)}</td>
      <td>${humanizeMetricLabel(check.metric, artifact)}</td>
      <td class="col-num">${typeof check.current_value === "number" ? num(check.current_value, 3) : humanize(check.current_value)}</td>
      <td class="col-num">${typeof check.breach_threshold === "number" ? num(check.breach_threshold, 3) : humanize(check.breach_threshold)}</td>
      <td class="col-status">${statusBadge(check.status)}</td>
      <td class="wrap-cell">${escapeHtml(check.required_action || check.action || "Review")}</td>
      <td>${humanize(check.review_status || "Open")}</td>
    </tr>`).join("") || `<tr><td colspan="8">No active strategy alerts or limit issues on current model scope.</td></tr>`;
}

function renderReportRebalancePanel(artifact) {
  const el = document.getElementById("reportRebalancePanel");
  if (!el) return;
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  if (proposal.status === "No rebalance proposed") {
    el.innerHTML = `<div class="rebalance-summary-card">
      <p><strong>No rebalance proposed</strong></p>
      <p>Current allocation remains under monitoring</p>
      <p>Transaction cost: ${money(0)}</p>
      <p>Human decision status: ${escapeHtml(latestHumanDecision()?.event || "Not recorded")}</p>
      <p>Execution authorization: Not authorized</p>
    </div>`;
    return;
  }
  if (proposal.status === "Simulation required") {
    el.innerHTML = `<div class="rebalance-summary-card">
      <p><strong>Simulation required</strong></p>
      <p>Proposed weights differ from current allocation. Run simulation before human review.</p>
      <p>Human decision status: ${escapeHtml(latestHumanDecision()?.event || "Not recorded")}</p>
      <p>Execution authorization: Not authorized</p>
    </div>`;
    return;
  }
  const rows = uiStrategies(artifact).filter((s) => Math.abs((proposalSession.weights[s.strategy_id] || 0) - (s.current_weight || 0)) > 1e-6);
  el.innerHTML = `<div class="rebalance-summary-card">
    <p><strong>${proposal.status}</strong> · ${proposal.detail}</p>
    <p>Estimated cost: ${money(proposalSession.simulation.estimatedCost || 0)} · Turnover: ${pct(proposalSession.simulation.turnover || 0, 1)}</p>
    <p>Gate status: ${statusBadge(proposal.tone === "breach" ? "blocked" : proposal.tone === "warning" ? "watch" : "clear")}</p>
    <p>Human decision: ${escapeHtml(latestHumanDecision()?.event || "Not recorded")} · Execution: Not authorized</p>
  </div>
  <div class="table-viewport short"><div class="table-scroll"><table class="data-table dense"><tr><th>Strategy</th><th>Current</th><th>Proposed</th><th>Change</th><th>Est. cost</th></tr>
    ${rows.map((s) => {
      const current = s.current_weight || 0;
      const proposed = proposalSession.weights[s.strategy_id] || 0;
      const change = proposed - current;
      return `<tr><td>${escapeHtml(s.name)}</td><td>${pct(current)}</td><td>${pct(proposed)}</td><td class="${cls(change)}">${pct(change)}</td><td>${money(Math.abs(change) * artifact.initial_capital * 0.0005)}</td></tr>`;
    }).join("")}
  </table></div></div>`;
}

function renderReportMonitoringPanel(artifact) {
  const el = document.getElementById("reportMonitoringPanel");
  if (!el) return;
  const recs = artifact.recommendations || [];
  const dq = artifact.data_quality || {};
  el.innerHTML = `
    <p><strong>Next-day watchlist</strong></p>
    ${recs.slice(0, 4).map((rec) => `<p>${statusBadge(rec.priority)} ${escapeHtml(humanizeUserFacingText(rec.action, artifact))}</p>`).join("") || emptyState("No watchlist items.")}
    <p><strong>Market events to monitor</strong></p>
    ${(artifact.market_monitor || []).slice(0, 4).map((row) => `<p>${row.ticker}: ${escapeHtml(row.risk_interpretation || "Monitor proxy move")}</p>`).join("") || emptyState("No market proxy warnings.")}
    <p><strong>Data issues to verify</strong></p>
    <p>Missing series: ${(dq.missing_return_series || []).length} · Common window: ${dq.common_portfolio_risk_window_observations || 0} obs</p>
    <p><strong>Follow-up owners</strong></p>
    <p>Risk manager · Portfolio manager · Data operations (prototype local review)</p>`;
}

function renderReportDataQualityPanel(artifact) {
  const el = document.getElementById("reportDataQualityPanel");
  if (!el) return;
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length) {
    const model = ResearchUniverse.dailyReportModel();
    el.innerHTML = `
      <p><strong>Report mode:</strong> Strategy 21 research/shadow · HISTORICAL RESEARCH + optional INTRADAY SHADOW ESTIMATE</p>
      <p><strong>Latest market-data timestamp:</strong> ${escapeHtml(String(model.latest_market_data))}</p>
      <p><strong>Latest position date:</strong> ${escapeHtml(String(model.latest_position_date || "n/a"))}</p>
      <p><strong>Data coverage:</strong> ${escapeHtml(String(model.coverage))}</p>
      <p><strong>Missing tickers:</strong> ${escapeHtml((model.missing_tickers || []).join(", ") || "None flagged")}</p>
      <p><strong>Live trading:</strong> LIVE — NOT AVAILABLE</p>
      <p><strong>Limitations:</strong> Pilot 500 survivorship bias · point-in-time limitation · borrow/market-impact not modeled · walk-forward not in current baseline.</p>`;
    return;
  }
  const dq = artifact.data_quality || {};
  const proxy = deriveCanonicalProxyDataState(artifact);
  const intraday = artifact.intraday_marks?.data_quality || dq.intraday || {};
  el.innerHTML = `
    <p><strong>Market proxy source:</strong> yfinance research proxy (${dq.source || "artifact"})</p>
    <p><strong>Latest observation:</strong> ${artifact.live_market_as_of || intraday.latest_observation_ts_et || dq.latest_strategy_end || "n/a"}</p>
    <p><strong>Retrieval time:</strong> ${artifact.build_metadata?.data_retrieved_at || artifact.live_refreshed_at || "n/a"}</p>
    <p><strong>Data state:</strong> ${proxy.label} — ${proxy.detail}</p>
    <p><strong>Missing / stale tickers:</strong> ${(intraday.missing_tickers || []).join(", ") || "None flagged"} / ${(intraday.stale_tickers || []).join(", ") || "None flagged"}</p>
    <p><strong>Disclosure:</strong> ${escapeHtml(artifact.data_classification?.disclosure || "Prototype model portfolio; not live positions or fills.")}</p>
    <p><strong>Model limitations:</strong> ${escapeHtml(dq.important_note || "Operating-period metrics may be unavailable with short history.")}</p>
    <p><strong>Audit limitation:</strong> Decision events in this prototype are stored in browser localStorage only.</p>`;
}

function buildDailyMemoSections(artifact) {
  if (typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode() && ResearchUniverse.strategyRows().length) {
    const model = ResearchUniverse.dailyReportModel();
    const hist = model.historical_metrics || {};
    const intraday = model.intraday_estimate || {};
    const weights = model.member_weights || ResearchUniverse.defaultResearchWeights();
    const missing = (model.missing_tickers || []).join(", ") || "None flagged";
    return [
      ["Executive risk conclusion", `Strategy 21 research/shadow daily report. ${model.strategy_21_status}. NOT LIVE · NOT ALLOCATION APPROVED.`],
      ["Historical research metrics", `Net return ${hist.cumulative_return == null ? "N/A" : pct(hist.cumulative_return, 1)} · Sharpe ${hist.sharpe == null ? "N/A" : num(hist.sharpe, 2)} · Vol ${hist.volatility == null ? "N/A" : pct(hist.volatility, 1)} · Max DD ${hist.max_drawdown == null ? "N/A" : pct(hist.max_drawdown, 1)}.`],
      ["Strategy 21 member weights", `C2A2_020 ${pct(weights.C2A2_020 || 0, 0)} · C2B2_004 ${pct(weights.C2B2_004 || 0, 0)} · Excluded duplicate ${model.excluded_member || "C2A2_002"}.`],
      ["Intraday shadow estimate", intraday.available === false || intraday.daily_return == null ? "HISTORICAL RESEARCH ONLY · INTRADAY SHADOW ESTIMATE unavailable." : `INTRADAY SHADOW ESTIMATE ${pct(intraday.daily_return, 2)} · status ${intraday.status || "partial"}.`],
      ["Finalized shadow return", intraday.finalized_return == null ? "FINALIZED SHADOW RETURN not present in current snapshot." : `FINALIZED SHADOW RETURN ${pct(intraday.finalized_return, 2)}.`],
      ["Alerts", `Drawdown ${model.alerts?.drawdown || "monitor"} · Correlation ${model.alerts?.correlation || "monitor"} · Concentration ${model.alerts?.concentration || "monitor"} · Data quality ${model.alerts?.data_quality || "monitor"}.`],
      ["Data coverage", `Coverage ${model.coverage}. Missing tickers: ${missing}.`],
      ["Next monitoring action", "Continue Strategy 21 shadow research monitoring; do not treat proxy ETF NAV as authoritative PnL."],
      ["Human decision notes", latestHumanDecision()?.note || "No human decision recorded in this browser session."],
    ];
  }
  const est = reportNavEstimate(artifact);
  const allocated = uiStrategies(artifact).filter((s) => s.current_weight > 0);
  const winners = allocated.filter((s) => (s.daily_pnl || 0) > 0).sort((a, b) => b.daily_pnl - a.daily_pnl);
  const losers = allocated.filter((s) => (s.daily_pnl || 0) < 0).sort((a, b) => a.daily_pnl - b.daily_pnl);
  const issues = groupedCurrentPortfolioIssues(artifact).slice(0, 5);
  const proposal = deriveProposalStatus(artifact, proposalSession.simulation, proposalSession.weights);
  const lastDecision = latestHumanDecision();
  const regimeNote = (artifact.market_monitor || []).slice(0, 3).map((row) => `${row.ticker} ${pct(row.daily_return || 0, 2)}`).join("; ");
  const allocationConclusion = proposal.status === "No rebalance proposed"
    ? "No rebalance proposed. Current allocation remains under monitoring."
    : proposal.status === "Simulation required"
      ? "Weights differ from current allocation. Simulation required before human review."
      : `${proposal.status}. ${proposal.detail}${proposalSession.simulation ? ` Estimated transaction cost ${money(proposalSession.simulation.estimatedCost || 0)}.` : ""}`;
  return [
    ["Executive risk conclusion", `${proposal.status}. ${proposal.detail}`],
    ["Portfolio performance", `Current Model NAV ${money(est.nav)}; daily PnL ${money(est.dailyPnl)}; operating cumulative PnL ${money(est.cumPnl)}.`],
    ["Main contributors and detractors", `Contributors: ${winners.slice(0, 3).map((s) => `${s.name} ${money(s.daily_pnl)}`).join(", ") || "none"}. Detractors: ${losers.slice(0, 3).map((s) => `${s.name} ${money(s.daily_pnl)}`).join(", ") || "none"}.`],
    ["Market and proxy-regime context", regimeNote || "Market proxy monitor loaded from validated artifact / intraday snapshot."],
    ["Current portfolio, factor, and correlation issues", issues.map((check) => `${formatIssueSubjectLabel(check, artifact)}: ${humanizeMetricLabel(check.metric, artifact)} (${check.status})`).join("; ") || "No grouped current-model issues beyond routine monitoring."],
    ["Proposed allocation or no-rebalance conclusion", allocationConclusion],
    ["Human decision and conditions", lastDecision ? `${lastDecision.event} by ${lastDecision.actor}: ${lastDecision.note}` : "Human decision not yet recorded in this session."],
    ["Next monitoring actions", (artifact.recommendations || []).slice(0, 3).map((rec) => humanizeUserFacingText(rec.action, artifact)).join("; ") || "Continue operating-period monitoring and proxy-data quality checks."],
    ["Data quality and limitations", `${formatMonitoringState(artifact).stripDataState}. ${artifact.data_classification?.disclosure || ""}`],
  ];
}

function renderDailyMemo(artifact) {
  const sections = buildDailyMemoSections(artifact);
  const html = sections.map(([title, body]) => `<section><h3>${escapeHtml(title)}</h3><p>${escapeHtml(humanizeUserFacingText(body, artifact))}</p></section>`).join("");
  document.getElementById("dailyRiskMemo").innerHTML = html;
  const headerNote = typeof ResearchUniverse !== "undefined" && !ResearchUniverse.isLegacyProxyMode()
    ? "Strategy 21 research/shadow daily report · NOT LIVE · NOT ALLOCATION APPROVED"
    : "Prototype model portfolio · Research proxy data · Not live positions or fills";
  document.getElementById("generatedReport").innerHTML = `
    <header class="report-print-header">
      <h2>Daily Risk Report — ${artifact.as_of_date}</h2>
      <p>${headerNote}</p>
      ${reportFrozenAt ? `<p>Frozen at ${reportFrozenAt}</p>` : ""}
    </header>${html}`;
  const caption = document.getElementById("reportPreviewCaption");
  if (caption) caption.textContent = reportFrozenAt ? `Frozen ${reportFrozenAt}` : "Live preview from current artifact";
}

function renderDailyReport(artifact) {
  renderReportStatusStrip(artifact);
  renderDailyMemo(artifact);
  renderReportWorkflow(artifact);
  renderReportIssuesTable(artifact);
  renderReportRebalancePanel(artifact);
  renderReportDecisionLog(artifact);
  renderReportMonitoringPanel(artifact);
  renderReportDataQualityPanel(artifact);
}

async function generateDailyReport(artifact) {
  reportFrozenAt = new Date().toLocaleString();
  renderDailyReport(artifact);
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
    loadSystemProposalSession(artifact);
    await runSimulation(artifact);
  });
  document.getElementById("resetWeights").addEventListener("click", () => {
    initProposalSession(artifact);
    refreshProposalStatusViews(artifact);
  });
  document.getElementById("simulateWeights").addEventListener("click", () => runSimulation(artifact));
  const rebalanceJump = document.getElementById("openRebalanceTab");
  if (rebalanceJump) rebalanceJump.addEventListener("click", () => setActiveTab("Allocation & Rebalance"));
  document.getElementById("approveDecision").addEventListener("click", () => recordDecision(artifact, "Approved for execution review"));
  document.getElementById("modifyDecision").addEventListener("click", () => recordDecision(artifact, "Modification requested"));
  document.getElementById("rejectDecision").addEventListener("click", () => recordDecision(artifact, "Proposal rejected"));
  document.getElementById("generateReport").addEventListener("click", () => generateDailyReport(artifact));
  document.getElementById("addReportDecisionNote")?.addEventListener("click", () => {
    setActiveTab("Daily Risk Report / Decision Log");
    document.getElementById("reportDecisionNote")?.focus();
  });
  document.getElementById("printReport").addEventListener("click", async () => {
    if (!reportFrozenAt) generateDailyReport(artifact);
    setTimeout(() => window.print(), 100);
  });
  document.getElementById("exportJson").addEventListener("click", () => downloadBlob(`risk-decision-${artifact.as_of_date}.json`, "application/json", JSON.stringify({
    as_of_date: artifact.as_of_date,
    simulated_weights: proposalSession.weights,
    simulation: proposalSession.simulation,
    decisions: localDecisionEvents,
    execution_authorized: false,
  }, null, 2)));
  document.getElementById("exportCsv").addEventListener("click", () => {
    const rows = [["strategy_id", "strategy", "current_weight", "target_weight", "change", "estimated_cost"]];
    uiStrategies(artifact).forEach((strategy) => {
      const target = proposalSession.weights[strategy.strategy_id] || 0;
      const change = target - (strategy.current_weight || 0);
      rows.push([strategy.strategy_id, strategy.name, strategy.current_weight || 0, target, change, Math.abs(change) * artifact.initial_capital * .0005]);
    });
    downloadBlob(`allocation-simulation-${artifact.as_of_date}.csv`, "text/csv", rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"));
  });
}

async function init() {
  renderTabs();
  loadLocalDecisionEvents();
  document.body.classList.add("app-loading");
  const [, artifact, overlay] = await Promise.all([
    probeWorkstationApi(),
    loadArtifact(),
    loadLiveOverlay(),
  ]);
  mergeLiveOverlay(artifact, overlay);
  activeArtifact = artifact;
  await ensureFactoryResearchExtension();
  initProposalSession(artifact);
  renderResearchModeBanners();
  renderTopHeader(artifact);
  renderKpis(artifact);
  renderTables(artifact);
  renderWorkstationPanels(artifact);
  redrawAllCharts(artifact);
  renderTruthDisclosure(artifact);
  installOperationalControls(artifact);
  installLiveControls(artifact);
  installStrategyMonitorControls(artifact);
  installStrategyDrawerControls(artifact);
  const shadowFilter = document.getElementById("shadowStrategyStatusFilter");
  if (shadowFilter) shadowFilter.addEventListener("change", () => renderShadowStrategyRegistry(shadowFilter.value));
  await renderShadowStrategyRegistry();
  refreshResearchLabViews(artifact);
  installChartObservers(artifact);
  refreshProposalStatusViews(artifact);
  document.body.classList.remove("app-loading");
  scheduleSecondaryRender(artifact);
  scheduleResearchExtensionLoad(artifact);
}

init();
