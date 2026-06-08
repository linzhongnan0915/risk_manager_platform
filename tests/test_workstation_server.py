from pathlib import Path

from scripts.run_workstation_server import WorkstationHandler


def test_resolve_static_path_blocks_traversal():
    handler = WorkstationHandler.__new__(WorkstationHandler)
    handler.server_root = Path(__file__).resolve().parents[1]

    blocked = handler._resolve_static_path("/../output/dashboard_artifact.json")
    assert blocked is None

    allowed = handler._resolve_static_path("/dashboard/index.html")
    assert allowed is not None
    assert allowed.name == "index.html"
