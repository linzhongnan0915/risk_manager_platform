"""Serve the dashboard and expose rebalance simulation + live data APIs."""

from __future__ import annotations

import json
import mimetypes
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd

from src.allocation.rebalance_simulation import simulate_rebalance
from src.market.live_refresh import build_live_overlay, quick_refresh_market_and_news, write_live_overlay
from src.portfolio.return_alignment import align_strategy_series
from src.risk.limits import load_risk_limits


class WorkstationHandler(BaseHTTPRequestHandler):
    server_root = PROJECT_ROOT

    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _load_artifact(self) -> dict:
        path = self.server_root / "output" / "dashboard_artifact.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def _load_live_overlay(self) -> dict | None:
        path = self.server_root / "output" / "live_overlay.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _live_summary_payload(self, refresh: bool = False) -> dict:
        artifact = self._load_artifact()
        if refresh:
            overlay = write_live_overlay(artifact, refresh_market=True)
        else:
            overlay = self._load_live_overlay()
            if overlay is None:
                overlay = build_live_overlay(artifact)
        return {"ok": True, **overlay}

    def _strategy_returns_from_artifact(self, artifact: dict) -> dict[str, list[float]]:
        series_by_id: dict[str, pd.Series] = {}
        for strategy in artifact.get("strategies", []):
            series = strategy.get("risk_packet", {}).get("chart_series", {})
            dates = series.get("dates", [])
            values = series.get("returns", [])
            if dates and values:
                series_by_id[strategy["strategy_id"]] = pd.Series(
                    [float(value) for value in values],
                    index=pd.to_datetime(dates),
                    dtype=float,
                )
        strategy_ids = [strategy["strategy_id"] for strategy in artifact.get("strategies", [])]
        return align_strategy_series(series_by_id, strategy_ids).as_dict()

    def _resolve_static_path(self, raw_path: str) -> Path | None:
        decoded = unquote(raw_path.split("?", 1)[0])
        if decoded in {"", "/"}:
            decoded = "/dashboard/index.html"
        relative = decoded.lstrip("/").replace("\\", "/")
        if not relative or ".." in relative.split("/"):
            return None
        root = self.server_root.resolve()
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        if candidate.is_file():
            return candidate
        return None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"/api/health", "/api/health/"}:
            self._send_json({"status": "ok", "service": "risk_manager_workstation"})
            return
        if parsed.path in {"/api/live-summary", "/api/live-summary/"}:
            try:
                self._send_json(self._live_summary_payload(refresh=False))
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=500)
            return
        self._serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"/api/refresh-data", "/api/refresh-data/"}:
            try:
                self._send_json(self._live_summary_payload(refresh=True))
            except Exception as exc:
                self._send_json(
                    {"ok": False, "error": str(exc), "trace": traceback.format_exc(limit=2)},
                    status=500,
                )
            return
        if parsed.path not in {"/api/simulate", "/api/simulate/"}:
            self.send_error(404, "Not found")
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON body", "ok": False}, status=400)
            return

        try:
            artifact = self._load_artifact()
            strategy_returns = self._strategy_returns_from_artifact(artifact)
            if not strategy_returns:
                self._send_json(
                    {
                        "ok": False,
                        "error": "No aligned strategy return window available for simulation.",
                    },
                    status=400,
                )
                return
            current_weights = payload.get("current_weights") or artifact.get("allocation", {}).get("current_weights", {})
            target_weights = payload.get("target_weights") or payload.get("simulated_weights") or current_weights
            capital = float(payload.get("capital") or artifact.get("initial_capital") or 1_000_000)
            result = simulate_rebalance(
                strategy_returns,
                artifact.get("strategies", []),
                current_weights,
                target_weights,
                capital,
                load_risk_limits(),
            )
            result["ok"] = True
            self._send_json(result)
        except Exception as exc:
            self._send_json(
                {
                    "ok": False,
                    "error": str(exc),
                    "error_type": exc.__class__.__name__,
                    "trace": traceback.format_exc(limit=3),
                },
                status=500,
            )

    def _serve_static(self, path: str) -> None:
        file_path = self._resolve_static_path(path)
        if file_path is None:
            self.send_error(404, "File not found")
            return
        content = file_path.read_bytes()
        mime, _ = mimetypes.guess_type(str(file_path))
        relative = str(file_path.relative_to(self.server_root)).replace("\\", "/")
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        if relative.startswith("dashboard/") or relative.startswith("output/"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
        self.end_headers()
        self.wfile.write(content)


def _startup_refresh() -> None:
    try:
        artifact = json.loads((PROJECT_ROOT / "output" / "dashboard_artifact.json").read_text(encoding="utf-8"))
        write_live_overlay(artifact, refresh_market=True)
        print("Live market/news overlay refreshed on startup.")
    except Exception as exc:
        print(f"Startup live refresh skipped: {exc}")


def main(host: str = "127.0.0.1", port: int = 8765, refresh_on_start: bool = False) -> None:
    if refresh_on_start:
        _startup_refresh()
    server = ThreadingHTTPServer((host, port), WorkstationHandler)
    print(f"Risk Manager workstation server running at http://{host}:{port}/dashboard/index.html")
    print("APIs: POST /api/simulate | GET /api/live-summary | POST /api/refresh-data")
    server.serve_forever()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the Risk Manager workstation server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--refresh-on-start", action="store_true", help="Refresh yfinance market/news overlay before serving.")
    args = parser.parse_args()
    main(host=args.host, port=args.port, refresh_on_start=args.refresh_on_start)
