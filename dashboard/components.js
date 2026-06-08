/** Shared institutional UI render helpers for the risk workstation. */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusBadge(status) {
  const normalized = String(status || "watch").toLowerCase();
  const badge = normalized === "ok" || normalized.includes("pass") || normalized.includes("keep")
    || normalized.includes("within") || normalized === "eligible" || normalized.includes("clear")
    ? "ok"
    : normalized === "breach" || normalized.includes("reject") || normalized.includes("pause")
      || normalized.includes("block") || normalized.includes("fail")
      ? "breach"
      : "warning";
  return `<span class="badge ${badge}">${escapeHtml(String(status || "watch").replaceAll("_", " "))}</span>`;
}

function utilizationBar(utilization, status) {
  const pctVal = Math.min(100, Math.max(0, (Number(utilization) || 0) * 100));
  const tone = status === "breach" ? "breach" : status === "warning" || status === "watch" ? "warn" : "ok";
  return `<div class="util-bar ${tone}" title="${pctVal.toFixed(0)}% utilization"><span style="width:${pctVal}%"></span></div>`;
}

function compactKpiStrip(items) {
  return `<div class="kpi-strip">${items.map(([label, value, sub, tone]) => `
    <div class="kpi-strip-item ${tone || ""}">
      <span class="kpi-strip-label">${escapeHtml(label)}</span>
      <strong class="kpi-strip-value">${value}</strong>
      ${sub ? `<small class="kpi-strip-sub">${escapeHtml(sub)}</small>` : ""}
    </div>`).join("")}</div>`;
}

function panelHeader(title, controlsHtml = "") {
  return `<div class="panel-header"><span class="panel-header-title">${escapeHtml(title)}</span>${controlsHtml ? `<div class="panel-header-controls">${controlsHtml}</div>` : ""}</div>`;
}

function metricDelta(before, after, { lowerBetter = false, asPct = false, turnover = 0 } = {}) {
  const fmt = (v) => (asPct ? pct(v) : num(v));
  if ((turnover || 0) <= 0.0001 || !Number.isFinite(before) || !Number.isFinite(after)) {
    return { label: turnover <= 0.0001 ? "No change" : "N/A", className: "neutral", beforeText: fmt(before), afterText: fmt(after), deltaText: "" };
  }
  if (Math.abs(after - before) < 1e-8) {
    return { label: "Unchanged", className: "neutral", beforeText: fmt(before), afterText: fmt(after), deltaText: "" };
  }
  const improved = lowerBetter ? Math.abs(after) < Math.abs(before) : after > before;
  const delta = after - before;
  return {
    label: improved ? "Improved" : "Worse",
    className: improved ? "positive" : "negative",
    beforeText: fmt(before),
    afterText: fmt(after),
    deltaText: asPct ? pct(delta) : num(delta),
  };
}

function beforeAfterCell(before, after, options = {}) {
  const m = metricDelta(before, after, options);
  return `<div class="before-after">
    <span class="ba-values">${m.beforeText} → ${m.afterText}</span>
    <span class="ba-delta ${m.className}">${m.label}${m.deltaText ? ` (${m.deltaText})` : ""}</span>
  </div>`;
}

function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function formatEligibilityDisplay(strategy) {
  const elig = strategy.allocation_eligibility || {};
  const current = strategy.current_weight || 0;
  const proposed = strategy.proposed_weight || 0;
  if (current <= 0 && !elig.eligible) {
    if (elig.status === "blocked" || String(elig.label || "").toLowerCase().includes("block")) {
      return { label: "Research-only blocked", status: "breach", detail: elig.reason || "Not eligible for new allocation." };
    }
    return { label: "Pending eligibility", status: "warning", detail: elig.reason || "Eligibility pending." };
  }
  if (current > 0 && !elig.eligible) {
    if (proposed > current + 1e-6) {
      return {
        label: "Existing allocation under review · Reduce-only",
        status: "warning",
        detail: "No increase permitted under current gates.",
      };
    }
    return {
      label: "Existing allocation under review",
      status: "warning",
      detail: `${elig.reason || "Allocated position under governance review."} Reduce-only. No increase permitted.`,
    };
  }
  if (current > 0 && proposed < current - 1e-6 && elig.eligible) {
    return { label: "Reduce-only", status: "warning", detail: "Proposed reduction; increases blocked if ineligible." };
  }
  if (elig.eligible) return { label: "Eligible", status: "ok", detail: elig.reason || "Eligible under current rule set." };
  return { label: humanize(elig.label || elig.status, "Pending"), status: "warning", detail: elig.reason || "" };
}

const METRIC_DISPLAY_LABELS = {
  equity_beta: "Equity Beta",
  credit_spread: "Credit Spread Exposure",
  rates_duration: "Rates Duration",
  factor_herfindahl: "Factor Concentration",
  max_factor_change_per_rebalance: "Maximum Factor Change per Rebalance",
  cash_exposure: "Treasury-Bill / Liquidity Proxy Exposure",
  residual_cash: "Unallocated Residual Cash",
  latest_63d_rolling_sharpe: "Latest 63D Rolling Sharpe",
  annualized_volatility: "Annualized Volatility",
  max_drawdown: "Maximum Drawdown",
  var_99_1d: "VaR 99% (1D)",
};

function humanizeMetricLabel(metric, artifact = activeArtifact) {
  if (!metric) return "Not available";
  const key = String(metric);
  if (METRIC_DISPLAY_LABELS[key]) return METRIC_DISPLAY_LABELS[key];
  const factorLabels = artifact?.factors?.factor_display_labels || {};
  if (factorLabels[key]) return factorLabels[key];
  if (key === "cash" || key === "cash_exposure") return "Treasury-Bill / Liquidity Proxy Exposure";
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeUserFacingText(text, artifact = activeArtifact) {
  if (text == null || text === "") return text ?? "";
  let output = String(text);
  Object.entries(METRIC_DISPLAY_LABELS).forEach(([key, label]) => {
    output = output.replaceAll(key, label);
  });
  const factorLabels = artifact?.factors?.factor_display_labels || {};
  Object.entries(factorLabels).forEach(([key, label]) => {
    output = output.replaceAll(key, label);
  });
  return output;
}

const CURRENT_MODEL_SCOPES = new Set(["portfolio_live", "allocated_strategy_live", "factor", "scenario", "correlation", "rebalance"]);
const CURRENT_PORTFOLIO_SCOPES = new Set(["portfolio_live", "allocated_strategy_live", "factor", "scenario", "correlation"]);
const RESEARCH_QUALITY_SCOPES = new Set(["research_quality"]);
const DATA_QUALITY_SCOPES = new Set(["data_quality"]);

function resolveCheckSubject(check, artifact = activeArtifact) {
  const subjectId = check?.subject_id || "";
  if (!subjectId || subjectId === "portfolio") return "Portfolio";
  if (String(subjectId).includes(":")) {
    const [leftId, rightId] = String(subjectId).split(":");
    const left = (artifact?.strategies || []).find((row) => row.strategy_id === leftId);
    const right = (artifact?.strategies || []).find((row) => row.strategy_id === rightId);
    if (left && right) return `${left.name} / ${right.name}`;
    return String(subjectId).replaceAll(":", " / ");
  }
  const strategy = (artifact?.strategies || []).find((row) => row.strategy_id === subjectId);
  if (strategy) return strategy.name;
  if (check?.scope === "factor") return humanizeMetricLabel(check.metric, artifact);
  return humanizeMetricLabel(subjectId, artifact);
}

function resolveCheckSubjectType(check, artifact = activeArtifact) {
  const subjectId = String(check?.subject_id || "");
  if (!subjectId || subjectId === "portfolio") return "portfolio";
  if (subjectId.includes(":")) return "strategy pair";
  if (check?.scope === "factor") return "factor";
  if ((artifact?.strategies || []).some((row) => row.strategy_id === subjectId)) return "strategy";
  return "portfolio";
}

function formatIssueSubjectLabel(check, artifact = activeArtifact) {
  const type = resolveCheckSubjectType(check, artifact);
  const label = resolveCheckSubject(check, artifact);
  if (type === "portfolio") return label === "Portfolio" ? "Portfolio" : `Portfolio · ${label}`;
  if (type === "strategy") return `Strategy · ${label}`;
  if (type === "factor") return `Factor · ${label}`;
  if (type === "strategy pair") return `Strategy pair · ${label}`;
  return `${humanize(type)} · ${label}`;
}

function inferMetricFamily(check) {
  const metric = String(check?.metric || "");
  const scope = String(check?.scope || "");
  if (scope === "correlation" || metric.includes("correlation") || metric.includes("duplicate_exposure")) return "correlation";
  if (scope === "factor" || METRIC_DISPLAY_LABELS[metric]) return "factor_exposure";
  if (scope === "scenario") return "scenario";
  if (scope === "allocated_strategy_live") return "strategy_limit";
  if (scope === "portfolio_live") return "portfolio_limit";
  if (scope === "rebalance") return "rebalance_gate";
  if (scope === "data_quality") return "data_quality";
  if (scope === "research_quality") return "research_quality";
  return metric || scope || "general";
}

function inferEconomicIssue(check) {
  const metric = String(check?.metric || "");
  if (metric === "duplicate_exposure_pair_count" || metric === "max_pairwise_positive_correlation") {
    return "duplicate_strategy_exposure";
  }
  if (check?.scope === "factor") return metric || "factor_exposure";
  if (check?.scope === "correlation" && metric.includes("pair")) return "duplicate_strategy_exposure";
  return metric || check?.check_id || "general";
}

function canonicalIssueGroupKey(check) {
  if (check.group_key) return check.group_key;
  const subject = check.subject_id || "portfolio";
  const scope = check.scope || "";
  const family = check.metric_family || inferMetricFamily(check);
  const economic = check.economic_issue || inferEconomicIssue(check);
  return `${subject}|${scope}|${family}|${economic}`;
}

function collectScopedChecks(artifact = activeArtifact, filter = "current_model") {
  const scopes = artifact?.risk_status_summary?.scopes || {};
  const rows = [];
  Object.entries(scopes).forEach(([scopeName, scope]) => {
    (scope.checks || []).forEach((check) => {
      if (["ok", "not_evaluated"].includes(check.status)) return;
      rows.push({ ...check, scope: check.scope || scopeName });
    });
  });
  if (filter === "current_model") {
    return rows.filter((check) => CURRENT_MODEL_SCOPES.has(check.scope));
  }
  if (filter === "research") {
    return rows.filter((check) => RESEARCH_QUALITY_SCOPES.has(check.scope));
  }
  if (filter === "data") {
    return rows.filter((check) => DATA_QUALITY_SCOPES.has(check.scope));
  }
  if (filter === "governance") {
    return rows.filter((check) => check.scope === "rebalance" || check.allocation_relevance === "governance");
  }
  return rows;
}

function groupedCanonicalIssues(artifact = activeArtifact, filter = "current_model") {
  const seen = new Set();
  return collectScopedChecks(artifact, filter).filter((check) => {
    const key = canonicalIssueGroupKey(check);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupedCurrentPortfolioIssues(artifact = activeArtifact) {
  return groupedCanonicalIssues(artifact, "all").filter((check) => CURRENT_PORTFOLIO_SCOPES.has(check.scope));
}

function countCurrentPortfolioBreaches(artifact = activeArtifact) {
  return groupedCurrentPortfolioIssues(artifact).filter((check) => check.status === "breach").length;
}

function countIssueCategories(artifact = activeArtifact) {
  const currentPortfolio = groupedCurrentPortfolioIssues(artifact);
  return {
    current_model_issues: currentPortfolio.length,
    breached_controls: currentPortfolio.filter((check) => check.status === "breach").length,
    research_quality: groupedCanonicalIssues(artifact, "research").length,
    data_quality: groupedCanonicalIssues(artifact, "data").length,
    governance: groupedCanonicalIssues(artifact, "governance").length,
  };
}

function summarizeProposalGateImpact(simulation) {
  const gates = simulation?.proposalGates || [];
  return {
    newBreaches: gates.filter((gate) => gate.gate === "new_hard_breach" && gate.status === "breach").length,
    worsened: gates.filter((gate) => gate.gate === "worsened_hard_breach").length,
    improved: gates.filter((gate) => gate.gate === "resolved_check").length,
    blockers: gates.filter((gate) => gate.status === "breach").length,
  };
}

function deriveWorkflowPresentation(artifact, proposalStatus) {
  const workflow = artifact?.decision_workflow || {};
  const stage1 = workflow.stage_1_proposal || {};
  const stage2 = workflow.stage_2_independent_risk_review || {};
  const stage3 = workflow.stage_3_decision_authority || {};
  const stage4 = workflow.stage_4_execution_and_monitoring || {};
  if (proposalStatus?.status === "No rebalance proposed") {
    return {
      workflowStatus: "monitoring_only",
      stages: [
        {
          title: "Proposal",
          status: "no_active_rebalance",
          statusLabel: "No active rebalance proposal",
          owner: stage1.proposal_owner || "Portfolio manager",
          next: "Continue monitoring current allocation",
        },
        {
          title: "Independent risk review",
          status: "not_required",
          statusLabel: "Not required",
          owner: "Risk manager",
          next: "No changed proposal to review",
        },
        {
          title: "Human decision",
          status: "monitoring_acknowledgement",
          statusLabel: "Monitoring acknowledgement only",
          owner: stage3.decision_owner || "Decision authority",
          next: "Acknowledge current breaches and monitoring actions",
        },
        {
          title: "Execution & monitoring",
          status: "not_authorized",
          statusLabel: "Not authorized",
          owner: "Operations / risk monitoring",
          next: "No execution without an approved rebalance",
        },
      ],
    };
  }
  if (proposalStatus?.status === "Simulation required") {
    return {
      workflowStatus: "proposal_draft_pending_simulation",
      stages: [
        {
          title: "Proposal",
          status: "draft_pending_simulation",
          statusLabel: "Active rebalance draft",
          owner: stage1.proposal_owner || "Portfolio manager",
          next: proposalStatus.detail,
        },
        {
          title: "Independent risk review",
          status: "not_started",
          statusLabel: "Not required until simulation",
          owner: "Risk manager",
          next: "Run simulation before independent review",
        },
        {
          title: "Human decision",
          status: "pending",
          statusLabel: "Awaiting simulated proposal",
          owner: stage3.decision_owner || "Decision authority",
          next: "Decision unavailable until simulation completes",
        },
        {
          title: "Execution & monitoring",
          status: "not_authorized",
          statusLabel: "Not authorized",
          owner: "Operations / risk monitoring",
          next: "Execution remains disabled",
        },
      ],
    };
  }
  const reviewBlocked = proposalStatus?.status === "Blocked by hard risk gate";
  return {
    workflowStatus: reviewBlocked ? "risk_review_blocked" : "pending_human_decision",
    stages: [
      {
        title: "Proposal",
        status: stage1.status || "submitted_for_independent_risk_review",
        statusLabel: proposalStatus?.status || "Active rebalance proposal",
        owner: stage1.proposal_owner || "Portfolio manager",
        next: proposalStatus?.detail || stage1.objective || "Awaiting risk review",
      },
      {
        title: "Independent risk review",
        status: reviewBlocked ? "blocked_pending_modification" : (stage2.status || "pending_human_risk_signoff"),
        statusLabel: reviewBlocked ? "Blocked by proposal gate" : humanize(stage2.status, "Pending human review"),
        owner: "Risk manager",
        next: reviewBlocked
          ? proposalStatus.detail
          : (stage2.required_next_action || stage2.system_conclusion || "Independent review pending"),
      },
      {
        title: "Human decision",
        status: stage3.status || "pending_human_decision",
        statusLabel: humanize(stage3.status, "Pending human decision"),
        owner: stage3.decision_owner || "Decision authority",
        next: stage3.required_next_action || "Awaiting reviewer decision",
      },
      {
        title: "Execution & monitoring",
        status: stage4.execution_status || "not_authorized_not_executed",
        statusLabel: stage4.execution_authorized ? "Authorized" : "Not authorized",
        owner: "Operations / risk monitoring",
        next: stage4.required_next_action || stage4.realized_outcome_status || "Execution disabled in prototype",
      },
    ],
  };
}

function deriveCanonicalProxyDataState(artifact = activeArtifact) {
  const status = artifact?.intraday_refresh_status || {};
  if (status.monitoring_offline || status.ok === false) {
    return {
      label: "Monitoring offline",
      detail: "Refresh status API unavailable; showing last validated artifact values.",
      marketStatus: status.market_status || artifact?.build_metadata?.market_as_of ? "Closed" : "Unknown",
      tone: "warning-text",
    };
  }
  if (status.canonical_data_state) {
    return {
      label: status.canonical_data_state,
      detail: status.disclosure || "Research market proxy refresh.",
      marketStatus: status.market_status || "Closed",
      tone: status.canonical_data_state === "Current intraday proxy" ? "positive"
        : ["Delayed", "Stale", "Refresh failed", "Monitoring offline"].includes(status.canonical_data_state) ? "warning-text" : "",
    };
  }
  const meta = artifact?.build_metadata || {};
  const marketStatus = status.market_status;
  const hasSnapshot = Boolean(status.snapshot_id || artifact.intraday_snapshot_id);
  if (status.in_progress || status.refresh_state === "refreshing") {
    return { label: "Refreshing", detail: "Intraday proxy refresh in progress.", marketStatus: marketStatus || "Open", tone: "" };
  }
  if (status.refresh_state === "failed" || status.data_freshness === "Failed") {
    return { label: "Refresh failed", detail: status.last_error || "Last refresh failed; prior snapshot retained.", marketStatus: marketStatus || "Closed", tone: "negative" };
  }
  if (marketStatus && marketStatus !== "Open") {
    return {
      label: "Latest market close",
      detail: hasSnapshot ? "Outside regular session; showing last valid proxy snapshot." : "No intraday snapshot yet · Using latest validated daily proxy snapshot",
      marketStatus,
      tone: "",
    };
  }
  if (status.data_freshness === "Current") return { label: "Current intraday proxy", detail: "Regular-session intraday proxy marks.", marketStatus: marketStatus || "Open", tone: "positive" };
  if (status.data_freshness === "Delayed") return { label: "Delayed", detail: "Partial ticker coverage on last refresh.", marketStatus: marketStatus || "Open", tone: "warning-text" };
  if (status.data_freshness === "Stale") return { label: "Stale", detail: "Observation age exceeds configured threshold.", marketStatus: marketStatus || "Open", tone: "negative" };
  return {
    label: "Latest market close",
    detail: hasSnapshot ? "Validated proxy snapshot." : "No intraday snapshot yet · Using latest validated daily proxy snapshot",
    marketStatus: marketStatus || "Closed",
    tone: "",
  };
}

function countOpenDecisionReviews(artifact, localEvents = []) {
  const openFromEvents = (localEvents || []).filter((e) => !String(e.event || "").toLowerCase().includes("approved") && !String(e.event || "").toLowerCase().includes("reject")).length;
  const alerts = (artifact?.human_review_alerts || artifact?.factors?.human_review_alerts || []).length;
  return Math.max(openFromEvents, alerts > 0 ? 1 : 0);
}

function proposalIsUnchanged(artifact, simulatedWeights) {
  return (artifact.strategies || []).every((s) => Math.abs((simulatedWeights[s.strategy_id] || 0) - (s.current_weight || 0)) < 1e-6);
}

function deriveProposalStatus(artifact, simulationResult, simulatedWeights) {
  const gateBlockers = (simulationResult?.proposalGates || []).filter((g) => g.status === "breach");
  const simBlockers = (simulationResult?.checks || []).filter((c) => c.status === "breach");
  const unchanged = proposalIsUnchanged(artifact, simulatedWeights);
  if (unchanged) {
    return { status: "No rebalance proposed", tone: "neutral", detail: "Transaction cost: $0 · Current weights unchanged" };
  }
  if (!simulationResult) {
    return { status: "Simulation required", tone: "warning", detail: "Run simulation before human review" };
  }
  if (gateBlockers.length || simBlockers.length) {
    return { status: "Blocked by hard risk gate", tone: "breach", detail: `${gateBlockers.length + simBlockers.length} hard blocker(s)` };
  }
  return { status: "Ready for human review", tone: "ok", detail: "Gates clear · Awaiting reviewer decision" };
}

let workstationMonitoring = {
  apiOnline: null,
  staticMode: false,
};

function setWorkstationMonitoring(apiOnline, staticMode = false) {
  workstationMonitoring.apiOnline = apiOnline;
  workstationMonitoring.staticMode = staticMode;
}

function formatMonitoringState(artifact = activeArtifact) {
  const status = artifact?.intraday_refresh_status || {};
  const proxy = deriveCanonicalProxyDataState(artifact);
  const marketStatus = status.market_status || proxy.marketStatus || "Closed";
  const marketOpen = marketStatus === "Open";

  if (workstationMonitoring.staticMode) {
    return {
      headerMarket: marketStatus,
      headerData: "Static validated artifact",
      stripMonitoring: "No automatic refresh",
      stripDataState: proxy.label || "Latest market close",
      schedulerLabel: "No automatic refresh",
      detail: "Dashboard loaded from static artifact without live workstation APIs.",
      tone: "",
    };
  }

  if (workstationMonitoring.apiOnline === false || status.monitoring_offline || status.ok === false) {
    return {
      headerMarket: marketStatus,
      headerData: "Using static validated artifact",
      stripMonitoring: "Workstation API offline",
      stripDataState: "Using static validated artifact",
      schedulerLabel: "No automatic refresh",
      detail: "Refresh status API unavailable; showing last validated artifact values.",
      tone: "warning-text",
    };
  }

  const demoSchedulerLabel =
    status.scheduler_label
    || (status.demo_hosting && status.scheduler_enabled === false
      ? "Manual refresh only while service is running"
      : status.demo_hosting
        ? "Scheduler active while service is running"
        : null);

  if (marketOpen) {
    return {
      headerMarket: "Open",
      headerData: proxy.label || "Current intraday proxy",
      stripMonitoring: demoSchedulerLabel || "Scheduled monitoring active",
      stripDataState: proxy.label || "Current intraday proxy",
      schedulerLabel: demoSchedulerLabel || "Scheduled monitoring active",
      detail: proxy.detail,
      tone: proxy.tone || "positive",
    };
  }

  return {
    headerMarket: "Closed",
    headerData: "Latest market close",
    stripMonitoring: demoSchedulerLabel || "Scheduler active",
    stripDataState: "Latest market close",
    schedulerLabel: demoSchedulerLabel || "Scheduler active",
    detail: proxy.detail,
    tone: "",
  };
}

function formatOosWindows(walk = {}) {
  const positive = walk.positive_windows;
  const total = walk.number_of_windows;
  if (positive == null || total == null || !Number.isFinite(Number(positive)) || !Number.isFinite(Number(total))) {
    return "N/A";
  }
  return `${positive} / ${total}`;
}

function tableViewport(contentHtml, className = "") {
  return `<div class="table-viewport ${className}"><div class="table-scroll">${contentHtml}</div></div>`;
}
