# Risk Manager Platform

Prototype multi-strategy portfolio risk workstation for independent risk review, allocation simulation, and decision logging. This is **not** live fund data, not authorized execution, and not a retail dashboard.

## Local Launch

```powershell
pip install -r requirements.txt
python scripts/validate_deployment_artifact.py
python scripts/run_workstation_server.py
```

Open: `http://127.0.0.1:8765/dashboard/index.html`

Development / browser verification:

```powershell
pip install -r requirements-dev.txt
playwright install chromium
python -m pytest -q
python scripts/verify_dashboard_browser.py --no-screenshots
python scripts/verify_drawer_charts.py
```

## Render Deployment

This repo ships as **one public Render Web Service** using the committed deployment seed artifact.

| Item | Value |
|------|-------|
| Build command | `pip install -r requirements.txt && python scripts/validate_deployment_artifact.py` |
| Start command | `python scripts/run_workstation_server.py --host 0.0.0.0 --port $PORT` |
| Health check | `GET /api/health` |
| Runtime | Python 3.12 (`render.yaml`) |
| Bind address | `0.0.0.0:$PORT` via `HOST` / `PORT` env and CLI |

Render configuration lives in `render.yaml`. The build **does not regenerate** the dashboard artifact. It validates the committed seed at `output/dashboard_artifact.json`.

### Baseline artifact policy

- `output/dashboard_artifact.json` is an intentional, validated deployment seed (20 strategies, literature results, chart series, portfolio return history).
- Regenerating without ignored literature inputs can produce empty Research Lab / chart data; do not replace the seed casually in production deploys.
- Compact JSON (`separators=(",", ":")`) is used for generation and deployment.
- Runtime overlays (`live_overlay.json`, intraday snapshots, locks) remain gitignored.

Validate locally:

```powershell
python scripts/validate_deployment_artifact.py
```

### Free-hosting / refresh limitation

On Render free tier the service sleeps when idle. Intraday scheduler and manual refresh only run **while the service is running**. The UI labels this as **“Scheduler active while service is running”** and does not imply guaranteed 24×7 30-minute monitoring.

When no valid intraday snapshot exists, the dashboard continues using the validated baseline artifact.

### Prototype data disclosure

- Strategy returns are literature-derived ETF-proxy backtests (`yfinance`), not boss live feeds.
- Factor exposures use a transparent proxy model, not licensed Barra.
- Human decision audit in this prototype is **browser localStorage only**.
- Allocation execution remains **unauthorized**; simulation and governance gates are for review only.

## APIs (same-origin)

- `GET /api/health`
- `GET /api/refresh/status`
- `POST /api/refresh` (manual cooldown enforced)
- `POST /api/simulate`
- `GET /api/live-summary`
- Static: `/dashboard/*`, `/output/dashboard_artifact.json`

JSON/JS/CSS/HTML responses support `gzip` when `Accept-Encoding: gzip` is sent. Dashboard data uses `Cache-Control: no-store`.

## Repository Docs

- Current MVP state: `docs/PROJECT_STATE.md`
- Dashboard artifact contract: `data/config/dashboard_artifact_contract.json`
- Requirements traceability: `docs/REQUIREMENTS_TRACEABILITY.md`

## Regenerate Artifact (local only)

```powershell
python scripts/generate_dashboard_artifact.py
python scripts/compact_dashboard_artifact.py
python scripts/validate_deployment_artifact.py
```

Only commit a regenerated artifact after validation and visual/browser checks.
