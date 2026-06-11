/* US-equity research universe: interim 13-member composite vs target 20-member architecture. */
const ResearchUniverse = (() => {
  const TARGET_PLATFORM_SLOTS = 20;
  const TARGET_EQUAL_WEIGHT = 0.05;
  const COMPOSITE_ID = "COMBINED_PORTFOLIO_V1";
  const COMPOSITE_INTERIM_LABEL = "INTERIM RESEARCH COMPOSITE — TARGET ARCHITECTURE 20 UNDERLYING STRATEGIES";

  let catalog = null;
  let artifact = null;
  let portfolioViewMode = "current";
  let correlationFilter = "UNDERLYING_ACTIVE";
  let workflowFilter = "US_EQUITY";
  let strategyTableFilter = "ALL_US_EQUITY";

  function hydrate(factoryCatalog, loadedArtifact) {
    catalog = factoryCatalog || catalog;
    artifact = loadedArtifact || artifact;
  }

  function architecture() {
    const fromCatalog = catalog?.architecture || {};
    const activeIds = activeUnderlyingIds();
    const referenceCount = strategyRows().filter((row) => row.research_group === "REFERENCE").length;
    return {
      target_underlying_count: fromCatalog.target_underlying_count || TARGET_PLATFORM_SLOTS,
      target_equal_weight: fromCatalog.target_equal_weight || TARGET_EQUAL_WEIGHT,
      tested_candidate_count: fromCatalog.tested_candidate_count || ((catalog?.results || []).length - 1),
      active_retained_count: fromCatalog.active_retained_count || activeIds.length,
      reference_only_count: fromCatalog.reference_only_count || referenceCount,
      interim_composite_count: fromCatalog.interim_composite_count || activeIds.length,
      interim_equal_weight: fromCatalog.interim_equal_weight || (activeIds.length ? 1 / activeIds.length : 0),
    };
  }

  function isLegacyProxyMode() {
    return portfolioViewMode === "legacy";
  }

  function setPortfolioViewMode(mode) {
    portfolioViewMode = mode === "legacy" ? "legacy" : "current";
  }

  function setCorrelationFilter(value) {
    correlationFilter = value || "UNDERLYING_ACTIVE";
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

  function compositeMeta() {
    return itemById(COMPOSITE_ID)?.backtest?.factory_research?.combined_portfolio
      || itemById(COMPOSITE_ID)?.backtest?.factory_research?.strategy_21
      || {};
  }

  function activeUnderlyingIds() {
    return (catalog?.results || [])
      .filter((row) => row.strategy_id !== COMPOSITE_ID && row.backtest?.factory_research?.composite_eligible)
      .map((row) => row.strategy_id);
  }

  function researchWeights() {
    const meta = compositeMeta();
    if (meta.weights && Object.keys(meta.weights).length) return meta.weights;
    const activeIds = activeUnderlyingIds();
    const weight = activeIds.length ? 1 / activeIds.length : 0;
    return Object.fromEntries(activeIds.map((id) => [id, weight]));
  }

  function classifyGroup(strategyId, backtest = {}) {
    if (strategyId === COMPOSITE_ID) return "COMBINED_PORTFOLIO";
    const membership = backtest.factory_research?.membership;
    if (membership === "REFERENCE_ONLY") return "REFERENCE";
    if (membership === "ACTIVE") return "ACTIVE";
    return "REFERENCE";
  }

  function sortRank(group) {
    return { ACTIVE: 1, WATCH: 2, COMBINED_PORTFOLIO: 3, STRATEGY_21: 3, REFERENCE: 4, LEGACY_PROXY: 9 }[group] || 9;
  }

  function rowFromCatalogItem(item) {
    const backtest = item?.backtest || {};
    const factory = backtest.factory_research || {};
    const strategyId = item.strategy_id || backtest.strategy_id;
    const group = classifyGroup(strategyId, backtest);
    const weights = researchWeights();
    const weight = strategyId === COMPOSITE_ID
      ? 0
      : (factory.composite_eligible ? (weights[strategyId] || 0) : 0);
    const holdings = backtest.holdings || null;
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
      transaction_cost_drag: backtest.turnover?.total_cost_drag ?? backtest.turnover?.annualized_cost_drag,
      ic: factory.mean_ic,
      decile_spread: factory.decile_spread,
      hypothesis: backtest.hypothesis,
      signal_summary: backtest.signal_summary,
      status_reason: factory.decision_reason || backtest.action?.interpretation,
      primary_return_driver: factory.logic?.expected_return_driver || backtest.signal_summary,
      main_limitation: (factory.limitations || [])[0] || "Pilot 500 survivorship-biased universe.",
      recommended_action: backtest.action?.action || "Review",
      final_action_after_double_check: backtest.action?.action || "Review",
      latest_data_date: backtest.latest_data_date,
      risk_status: group === "ACTIVE" ? "watch" : group === "FAIL" ? "breach" : "watch",
      live_risk_status: "not applicable",
      research_source: backtest.research_source,
      membership: factory.membership || "REFERENCE_ONLY",
      composite_eligible: factory.composite_eligible === true,
      holdings,
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
    return researchWeights();
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
    const dates = series.dates || catalog?.shared_dates || [];
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
    return {
      dates,
      returns,
      cumulative_return: cumulativeReturn,
      drawdown,
      label: COMPOSITE_INTERIM_LABEL,
    };
  }

  function intradayComposite() {
    const shadow = shadowState();
    return (shadow.strategies || []).find((row) => row.strategy_id === COMPOSITE_ID) || null;
  }

  function filterStrategyRows(filter = strategyTableFilter) {
    const rows = strategyRows();
    if (filter === "ACTIVE") return rows.filter((row) => row.research_group === "ACTIVE");
    if (filter === "COMBINED_PORTFOLIO" || filter === "STRATEGY_21") return rows.filter((row) => row.strategy_id === COMPOSITE_ID);
    if (filter === "WATCH") return rows.filter((row) => row.research_group === "WATCH");
    if (filter === "REFERENCE") return rows.filter((row) => row.research_group === "REFERENCE");
    if (filter === "FAIL") return rows.filter((row) => row.lifecycle_status === "FAIL");
    if (filter === "LEGACY_REFERENCE") return [];
    return rows;
  }

  function correlationDataset(filter = correlationFilter) {
    if (filter === "LEGACY_PROXY") return { legacy: true };
    const matrixSource = compositeMeta().correlation_matrix || {};
    const ids = activeUnderlyingIds();
    const names = Object.fromEntries(strategyRows().map((row) => [row.strategy_id, row.name]));
    const matrix = {};
    ids.forEach((left) => {
      matrix[left] = {};
      ids.forEach((right) => {
        if (left === right) matrix[left][right] = 1;
        else matrix[left][right] = Number((matrixSource[left] || {})[right] || 0);
      });
    });
    const pairs = [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        pairs.push({ strategy_left: ids[i], strategy_right: ids[j], daily_net_return_correlation: matrix[ids[i]][ids[j]] });
      }
    }
    return { ids, names, matrix, pairs, filter, underlying_only: true };
  }

  function factorCards() {
    const meta = compositeMeta();
    return (meta.members || []).slice(0, 8).map((member) => ({
      strategy_id: member.strategy_id,
      strategy_name: member.name,
      label: "Composite weight",
      kind: "MEASURED",
      detail: `${(member.weight * 100).toFixed(2)}% · Sharpe ${member.sharpe == null ? "N/A" : Number(member.sharpe).toFixed(2)}`,
    }));
  }

  function workflowRows(filter = workflowFilter) {
    if (filter === "LEGACY_REFERENCE") return (artifact?.strategies || []).map((row) => ({ ...row, research_group: "LEGACY_PROXY" }));
    return strategyRows().map((row) => ({
      ...row,
      workflow_gates: {
        data_validation: "complete",
        signal: "complete",
        backtest: "complete",
        walk_forward: "NOT AVAILABLE IN CURRENT BASELINE",
        risk_limits: "research review",
        registry: row.research_group,
        composite_eligibility: row.strategy_id === COMPOSITE_ID ? "research composite" : "member",
        shadow_eligibility: "not eligible",
      },
      evidence_status: "complete",
      signal_status: "complete",
      research_quality_status: row.research_group,
      registry_status: row.research_group,
      human_approval_required: false,
    }));
  }

  function dailyReportModel() {
    const composite = compositeItem()?.backtest || {};
    const meta = compositeMeta();
    const arch = architecture();
    return {
      report_date: artifact?.as_of_date,
      combined_portfolio_status: composite.lifecycle_status || "RESEARCH COMPOSITE",
      strategy_21_status: COMPOSITE_INTERIM_LABEL,
      member_weights: meta.weights || researchWeights(),
      historical_metrics: {
        cumulative_return: composite.net_metrics?.cumulative_return,
        cumulative_gross_return: composite.gross_metrics?.cumulative_return,
        sharpe: composite.net_metrics?.sharpe,
        volatility: composite.net_metrics?.annual_volatility,
        max_drawdown: composite.net_metrics?.max_drawdown,
        cost_drag: composite.turnover?.total_cost_drag,
      },
      pnl_label: "Unavailable",
      weight_formula: meta.weight_formula || "weight_i = 1 / N",
      N: meta.N || arch.interim_composite_count,
      target_N: arch.target_underlying_count,
      target_weight: arch.target_equal_weight,
      interim_label: meta.interim_label || COMPOSITE_INTERIM_LABEL,
    };
  }

  function researchLabGroups() {
    return ["ACTIVE", "WATCH", "COMBINED_PORTFOLIO", "REFERENCE", "LEGACY_PROXY"];
  }

  function counts() {
    const rows = strategyRows();
    return {
      active: rows.filter((row) => row.research_group === "ACTIVE").length,
      reference: rows.filter((row) => row.research_group === "REFERENCE").length,
      composite: rows.filter((row) => row.strategy_id === COMPOSITE_ID).length,
      tested: (catalog?.results || []).length - 1,
    };
  }

  return {
    TARGET_PLATFORM_SLOTS,
    TARGET_EQUAL_WEIGHT,
    COMPOSITE_ID,
    COMPOSITE_INTERIM_LABEL,
    GROUP_LABELS: {
      ACTIVE: "Active US-Equity Research",
      COMBINED_PORTFOLIO: "Combined Portfolio",
      STRATEGY_21: "Combined Portfolio",
      WATCH: "Watch Research",
      REFERENCE: "Reference Only",
      LEGACY_PROXY: "Research Reference / Legacy Proxy",
    },
    CORRELATION_LABELS: {
      UNDERLYING_ACTIVE: "Active Underlying Correlation",
      UNDERLYING_20X20: "Active Underlying Correlation",
      ALL_US_EQUITY: "All Backtested Research",
      LEGACY_PROXY: "Legacy Proxy Reference",
    },
    hydrate,
    architecture,
    counts,
    isLegacyProxyMode,
    setPortfolioViewMode,
    setCorrelationFilter,
    setWorkflowFilter,
    setStrategyTableFilter,
    strategyRows,
    filterStrategyRows,
    defaultResearchWeights,
    compositeItem,
    compositeMeta,
    portfolioSeries,
    intradayComposite,
    shadowState,
    correlationDataset,
    factorCards,
    workflowRows,
    dailyReportModel,
    itemById,
    researchLabGroups,
    mapResearchLabGroup: (row) => row.research_group || "ACTIVE",
    activeUnderlyingIds,
  };
})();
