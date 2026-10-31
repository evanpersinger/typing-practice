"""Exporting a profile's data."""

import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.main import app

pytestmark = pytest.mark.usefixtures("temp_db")

HEADERS = {"X-Profile": "testing"}


def test_the_export_lists_every_table_with_its_rows() -> None:
    db.add_word("necessary")

    with TestClient(app) as client:
        response = client.get("/export", headers=HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert {"words", "attempts", "sessions", "drills", "misspellings", "punctuation_misses"} <= data.keys()
    assert [row["word"] for row in data["words"]] == ["necessary"]
