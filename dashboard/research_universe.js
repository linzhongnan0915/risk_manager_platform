/* Single source of truth for current US-equity research vs legacy proxy reference views. */
const ResearchUniverse = (() => {
  const RETAINED_IDS = new Set(["C2A2_020", "C2B2_004"]);
  const COMPOSITE_ID = "STRATEGY_21_RESEARCH_COMPOSITE_V1";
  const DUPLICATE_IDS = new Set(["C2A2_002"]);
  const WATCHLIST_IDS = new Set(["C2B2_001", "C2B2_003"]);
  const FACTORY_IDS = [
    "C2A2_001", "C2A2_002", "C2A2_004", "C2A2_008", "C2A2_019", "C2A2_020",
    "C2B2_001", "C2B2_002", "C2B2_003", "C2B2_004", "C2B2_005", "C2B2_006",
  ];
  const RESEARCH_WEIGHTS = { C2A2_020: 0.5, C2B2_004: 0.5 };
  const GROUP_LABELS = {
    RETAINED: "Retained US-Equity",
    STRATEGY_21: "Strategy 21",
    WATCHLIST: "Watchlist",
    DUPLICATE: "Economic Duplicate",
    ARCHIVED: "Archived / Rejected",
    LEGACY_PROXY: "Research Reference / Legacy Proxy",
  };
  const CORRELATION_LABELS = {
    CURRENT_COMPOSITE: "Current Composite",
    RETAINED: "Retained",
    ALL_US_EQUITY: "All US-Equity Research",
    EXCLUDED_DUPLICATES: "Excluded Duplicates",
    LEGACY_PROXY: "Legacy Proxy Reference",
  };

  let catalog = null;
  let artifact = null;
  let portfolioViewMode = "current";
  let correlationFilter = "CURRENT_COMPOSITE";
  let workflowFilter = "US_EQUITY";
  let strategyTableFilter = "ALL_US_EQUITY";

  function hydrate(factoryCatalog, loadedArtifact) {
    catalog = factoryCatalog || catalog;
    artifact = loadedArtifact || artifact;
  }

  function isLegacyProxyMode() {
    return portfolioViewMode === "legacy";
  }

  function setPortfolioViewMode(mode) {
    portfolioViewMode = mode === "legacy" ? "legacy" : "current";
  }

  function setCorrelationFilter(value) {
    correlationFilter = value || "CURRENT_COMPOSITE";
  }

  function setWorkflowFilter(value) {
    workflowFilter = value || "US_EQUITY";
  }

  function setStrategyTableFilter(value) {
    strategyTableFilter = value || "ALL_US_EQUITY";
  }

  function itemById(strategyId) {
    return (catalog?.results || []).find((row) => (row.strategy_id || row.backtest?.strategy_id) === strategyId) || null;
  }

  function classifyGroup(strategyId, backtest = {}) {
    if (strategyId === COMPOSITE_ID) return "STRATEGY_21";
    if (RETAINED_IDS.has(strategyId)) return "RETAINED";
    if (DUPLICATE_IDS.has(strategyId)) return "DUPLICATE";
    if (WATCHLIST_IDS.has(strategyId)) return "WATCHLIST";
    const lifecycle = backtest.lifecycle_status || "";
    if (lifecycle.includes("REJECT") || lifecycle.includes("ARCHIV")) return "ARCHIVED";
    return "ARCHIVED";
  }

  function sortRank(group) {
    return { RETAINED: 1, STRATEGY_21: 2, WATCHLIST: 3, DUPLICATE: 4, ARCHIVED: 5, LEGACY_PROXY: 6 }[group] || 9;
  }

  function rowFromCatalogItem(item) {
    const backtest = item?.backtest || {};
    const factory = backtest.factory_research || {};
    const strategyId = item.strategy_id || backtest.strategy_id;
    const group = classifyGroup(strategyId, backtest);
    const weight = RESEARCH_WEIGHTS[strategyId] || 0;
    return {
      strategy_id: strategyId,
      name: backtest.name || strategyId,
      strategy_type: backtest.strategy_family || "us_equity_research",
      current_weight: weight,
      proposed_weight: weight,
      lifecycle_status: backtest.lifecycle_status || group.replaceAll("_", " "),
      research_group: group,
      allocation_eligible: false,
      allocation_eligibility: { eligible: false, label: "Not allocation approved", detail: "Research/shadow only" },
      net_return: backtest.net_metrics?.cumulative_return,
      gross_return: backtest.gross_metrics?.cumulative_return,
      daily_return: 0,
      daily_pnl: 0,
      sharpe: backtest.net_metrics?.sharpe,
      volatility: backtest.net_metrics?.annual_volatility,
      max_drawdown: backtest.net_metrics?.max_drawdown,
      turnover: backtest.turnover?.average_daily_turnover,
      transaction_cost_drag: backtest.turnover?.annualized_cost_drag,
      ic: factory.mean_ic,
      decile_spread: factory.decile_spread,
      hypothesis: backtest.hypothesis,
      status_reason: factory.decision_reason || backtest.action?.interpretation,
      primary_return_driver: factory.logic?.expected_return_driver || backtest.signal_summary,
      main_limitation: (factory.limitations || [])[0] || "Pilot 500 survivorship-biased universe.",
      recommended_action: backtest.action?.action || "Review",
      final_action_after_double_check: backtest.action?.action || "Review",
      latest_data_date: backtest.latest_data_date,
      risk_status: group === "RETAINED" ? "watch" : group === "ARCHIVED" ? "breach" : "watch",
      live_risk_status: group === "RETAINED" ? "watch" : "not applicable",
      research_source: backtest.research_source,
      factory_item: item,
      return_series: backtest.return_series,
      risk_packet: backtest.risk_packet,
      walk_forward: item.walk_forward,
    };
  }

  function strategyRows() {
    const rows = (catalog?.results || []).map(rowFromCatalogItem);
    return rows.sort((left, right) => sortRank(left.research_group) - sortRank(right.research_group) || left.strategy_id.localeCompare(right.strategy_id));
  }

  function defaultResearchWeights() {
    const weights = {};
    strategyRows().forEach((row) => {
      weights[row.strategy_id] = RESEARCH_WEIGHTS[row.strategy_id] || 0;
    });
    return weights;
  }

  function compositeItem() {
    return itemById(COMPOSITE_ID);
  }

  function shadowState() {
    const status = artifact?.intraday_refresh_status || {};
    return status.shadow_intraday || artifact?.intraday_marks?.shadow_intraday || {};
  }

  function portfolioSeries() {
    const composite = compositeItem()?.backtest;
    const series = composite?.return_series || {};
    const dates = series.dates || [];
    const returns = series.net_returns || [];
    let cumulative = 1;
    const cumulativeReturn = returns.map((value) => {
      cumulative *= 1 + Number(value || 0);
      return cumulative - 1;
    });
    let peak = 1;
    const drawdown = cumulativeReturn.map((value) => {
      const wealth = 1 + value;
      peak = Math.max(peak, wealth);
      return wealth / peak - 1;
    });
    return { dates, returns, cumulative_return: cumulativeReturn, drawdown, label: "Strategy 21 historical research" };
  }

  function intradayComposite() {
    const shadow = shadowState();
    return (shadow.strategies || []).find((row) => row.strategy_id === COMPOSITE_ID) || null;
  }

  function filterStrategyRows(filter = strategyTableFilter) {
    const rows = strategyRows();
    if (filter === "RETAINED") return rows.filter((row) => row.research_group === "RETAINED");
    if (filter === "STRATEGY_21") return rows.filter((row) => row.strategy_id === COMPOSITE_ID);
    if (filter === "WATCHLIST") return rows.filter((row) => row.research_group === "WATCHLIST");
    if (filter === "DUPLICATE") return rows.filter((row) => row.research_group === "DUPLICATE");
    if (filter === "ARCHIVED") return rows.filter((row) => row.research_group === "ARCHIVED");
    if (filter === "LEGACY_REFERENCE") return [];
    return rows;
  }

  function correlationDataset(filter = correlationFilter) {
    const s21 = compositeItem()?.backtest?.factory_research?.strategy_21 || {};
    const pairwise = s21.pairwise_analysis || [];
    let ids = [];
    if (filter === "CURRENT_COMPOSITE") ids = ["C2A2_020", "C2B2_004", COMPOSITE_ID];
    else if (filter === "RETAINED") ids = ["C2A2_020", "C2B2_004"];
    else if (filter === "ALL_US_EQUITY") ids = [...FACTORY_IDS, COMPOSITE_ID];
    else if (filter === "EXCLUDED_DUPLICATES") ids = ["C2A2_002", "C2A2_020", "C2B2_004"];
    else return { legacy: true };

    const names = Object.fromEntries(strategyRows().map((row) => [row.strategy_id, row.name]));
    names[COMPOSITE_ID] = names[COMPOSITE_ID] || "Strategy 21 Research Composite v1";
    const matrix = {};
    ids.forEach((left) => {
      matrix[left] = {};
      ids.forEach((right) => {
        if (left === right) {
          matrix[left][right] = 1;
          return;
        }
        const pair = pairwise.find((row) =>
          (row.strategy_left === left && row.strategy_right === right)
          || (row.strategy_left === right && row.strategy_right === left));
        matrix[left][right] = pair ? Number(pair.daily_net_return_correlation || 0) : 0;
      });
    });
    const pairs = pairwise.filter((row) => ids.includes(row.strategy_left) && ids.includes(row.strategy_right));
    return { ids, names, matrix, pairs, filter };
  }

  function factorCards() {
    const s21 = compositeItem()?.backtest?.factory_research?.strategy_21 || {};
    const overlap = s21.overlap_summary?.exposure_diagnostics || {};
    const cards = [];
    ["C2A2_020", "C2B2_004", COMPOSITE_ID].forEach((strategyId) => {
      const row = itemById(strategyId);
      const backtest = row?.backtest || {};
      const interpreted = backtest.factory_research?.factor_interpretation || [];
      interpreted.forEach((entry) => cards.push({ strategy_id: strategyId, strategy_name: backtest.name, ...entry }));
      const measured = overlap[strategyId] || {};
      Object.entries(measured).forEach(([metric, value]) => {
        cards.push({
          strategy_id: strategyId,
          strategy_name: backtest.name,
          label: metric.replaceAll("_", " "),
          kind: value === "NOT_AVAILABLE_FROM_EXISTING_ARTIFACTS" ? "NOT YET MEASURED" : "MEASURED",
          detail: String(value),
        });
      });
    });
    return cards;
  }

  function workflowRows(filter = workflowFilter) {
    if (filter === "LEGACY_REFERENCE") return (artifact?.strategies || []).map((row) => ({ ...row, research_group: "LEGACY_PROXY" }));
    return strategyRows().map((row) => {
      const backtest = row.factory_item?.backtest || {};
      const summary = backtest;
      const gates = backtest.factory_research || {};
      const archived = row.research_group === "ARCHIVED" || row.research_group === "DUPLICATE";
      return {
        ...row,
        workflow_gates: {
          data_validation: "complete",
          signal: "complete",
          backtest: "complete",
          walk_forward: "NOT AVAILABLE IN CURRENT BASELINE",
          risk_limits: row.research_group === "RETAINED" ? "shadow research" : archived ? "archived" : "research review",
          registry: row.research_group,
          composite_eligibility: row.strategy_id === COMPOSITE_ID ? "research composite" : RETAINED_IDS.has(row.strategy_id) ? "member" : "not eligible",
          shadow_eligibility: RETAINED_IDS.has(row.strategy_id) || row.strategy_id === COMPOSITE_ID ? "shadow research" : "not eligible",
        },
        evidence_status: "complete",
        signal_status: "complete",
        research_quality_status: archived ? "archived" : "research review",
        registry_status: row.research_group,
        human_approval_required: false,
        hypothesis: backtest.hypothesis || row.hypothesis,
        status_reason: gates.decision_reason || row.status_reason,
      };
    });
  }

  function dailyReportModel() {
    const composite = compositeItem()?.backtest || {};
    const s21 = composite.factory_research?.strategy_21 || {};
    const shadowComposite = intradayComposite();
    const status = artifact?.intraday_refresh_status || {};
    const missing = [...new Set((shadowState().strategies || []).flatMap((row) => row.missing_tickers || []))];
    const pnlLabel = shadowComposite?.available === false ? "Unavailable" : shadowComposite?.daily_pnl == null ? "Unavailable" : "Intraday shadow estimate";
    return {
      report_date: artifact?.as_of_date,
      latest_market_data: status.latest_observation || status.latest_completed_market_bar_at || "NOT AVAILABLE IN CURRENT BASELINE",
      latest_position_date: shadowComposite?.latest_data_date || composite.latest_data_date,
      coverage: `${status.ticker_count_successful ?? "n/a"}/${status.ticker_count_requested ?? "n/a"}`,
      missing_tickers: missing,
      strategy_21_status: shadowComposite?.status || composite.lifecycle_status || "RESEARCH COMPOSITE",
      member_weights: s21.weights || RESEARCH_WEIGHTS,
      historical_metrics: {
        cumulative_return: composite.net_metrics?.cumulative_return,
        sharpe: composite.net_metrics?.sharpe,
        volatility: composite.net_metrics?.annual_volatility,
        max_drawdown: composite.net_metrics?.max_drawdown,
      },
      intraday_estimate: shadowComposite,
      pnl_label: pnlLabel,
      alerts: s21.alerts || {},
      component_contribution: s21.component_contribution || {},
      excluded_member: (s21.excluded_members || [])[0],
    };
  }

  function researchLabGroups() {
    return ["RETAINED", "STRATEGY_21", "WATCHLIST", "ARCHIVED", "LEGACY_PROXY"];
  }

  function mapResearchLabGroup(row) {
    if (row.research_group === "RETAINED") return "RETAINED";
    if (row.research_group === "STRATEGY_21" || row.strategy_id === COMPOSITE_ID) return "STRATEGY_21";
    if (row.research_group === "WATCHLIST") return "WATCHLIST";
    if (row.research_group === "DUPLICATE" || row.research_group === "ARCHIVED") return "ARCHIVED";
    return "LEGACY_PROXY";
  }

  return {
    RETAINED_IDS,
    COMPOSITE_ID,
    DUPLICATE_IDS,
    WATCHLIST_IDS,
    CORRELATION_LABELS,
    GROUP_LABELS,
    hydrate,
    isLegacyProxyMode,
    setPortfolioViewMode,
    setCorrelationFilter,
    setWorkflowFilter,
    setStrategyTableFilter,
    getWorkflowFilter: () => workflowFilter,
    getStrategyTableFilter: () => strategyTableFilter,
    strategyRows,
    filterStrategyRows,
    defaultResearchWeights,
    compositeItem,
    portfolioSeries,
    intradayComposite,
    shadowState,
    correlationDataset,
    factorCards,
    workflowRows,
    dailyReportModel,
    itemById,
    researchLabGroups,
    mapResearchLabGroup,
  };
})();
