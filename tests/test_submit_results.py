"""POST /results, end to end through the app, against a throwaway database."""

import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.main import app

pytestmark = pytest.mark.usefixtures("temp_db")

PAYLOAD = {
    "results": [
        {
            "sentence": "Keep the two files separate.",
            "typed": "Keep the two files seperate.",
            "duration_ms": 4000,
            "target_words": ["separate"],
        }
    ]
}


def test_transcript_failure_does_not_fail_a_saved_submit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(*args: object, **kwargs: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(db, "write_session_transcript", broken)

    with TestClient(app) as client:
        response = client.post("/results", json=PAYLOAD, headers={"X-Profile": "testing"})

    # The rows are committed by now, so a 500 would make the retry record the
    # whole session a second time.
    assert response.status_code == 200
    assert len(db.list_sessions()) == 1


def test_the_backend_grades_the_target_words() -> None:
    with TestClient(app) as client:
        client.post("/results", json=PAYLOAD, headers={"X-Profile": "testing"})

    row = next(w for w in db.get_all_words() if w["word"] == "separate")
    assert (row["attempts"], row["misses"]) == (1, 1)


def test_a_word_typed_twice_is_not_recorded_as_a_miss() -> None:
    drill = {**PAYLOAD["results"][0], "typed": "Keep the the two files separate."}

    with TestClient(app) as client:
        client.post("/results", json={"results": [drill]}, headers={"X-Profile": "testing"})

    row = next(w for w in db.get_all_words() if w["word"] == "separate")
    assert (row["attempts"], row["misses"]) == (1, 0)
