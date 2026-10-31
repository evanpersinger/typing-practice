"""Serving a built frontend from the backend, so the app runs on one port."""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.main import serve_frontend


def build_app(dist: Path) -> tuple[FastAPI, bool]:
    app = FastAPI()

    @app.get("/stats")
    def stats() -> dict:
        return {"from": "api"}

    return app, serve_frontend(app, dist)


def test_nothing_is_served_when_the_frontend_is_not_built(tmp_path: Path) -> None:
    app, served = build_app(tmp_path / "dist")

    assert served is False
    assert TestClient(app).get("/").status_code == 404


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text("<h1>app</h1>")
    (tmp_path / "app.js").write_text("console.log(1)")
    return tmp_path


def test_a_built_frontend_is_served_next_to_the_api(dist: Path) -> None:
    app, served = build_app(dist)
    client = TestClient(app)

    assert served is True
    assert "<h1>app</h1>" in client.get("/").text
    assert client.get("/app.js").status_code == 200
    assert client.get("/stats").json() == {"from": "api"}


def test_the_api_prefix_the_frontend_uses_reaches_the_api(dist: Path) -> None:
    app, _ = build_app(dist)

    assert TestClient(app).get("/api/stats").json() == {"from": "api"}
