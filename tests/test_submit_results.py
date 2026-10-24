"""POST /results, end to end through the app, against a throwaway database."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.main import MAX_WEAK_WORDS, MISSPELL_STRIKES, app

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


def test_a_submit_that_fails_midway_leaves_nothing_behind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    two_drills = {
        "results": [
            PAYLOAD["results"][0],
            {
                "sentence": "It is necessary to check.",
                "typed": "It is neccessary to check.",
                "duration_ms": 4000,
                "target_words": ["necessary"],
            },
        ]
    }
    real_record_result = db.record_result
    calls = 0

    def fail_on_second_call(*args: object, **kwargs: object) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise sqlite3.OperationalError("database is locked")
        real_record_result(*args, **kwargs)

    monkeypatch.setattr(db, "record_result", fail_on_second_call)

    with TestClient(app, raise_server_exceptions=False) as client:
        failed = client.post("/results", json=two_drills, headers={"X-Profile": "testing"})
        # The frontend drops back to typing on a failure, so Enter resubmits
        monkeypatch.setattr(db, "record_result", real_record_result)
        client.post("/results", json=two_drills, headers={"X-Profile": "testing"})

    assert failed.status_code == 500
    assert len(db.list_sessions()) == 1
    assert db.get_typing_stats()["drills"] == 2
    row = next(w for w in db.get_all_words() if w["word"] == "separate")
    assert (row["attempts"], row["misses"]) == (1, 1)


def test_a_full_list_does_not_grow_from_a_session() -> None:
    for i in range(MAX_WEAK_WORDS):
        db.add_word(f"filler{i}")
    misspelled_untracked = {
        "sentence": "Keep the two files.",
        "typed": "Keep the two fiels.",
        "duration_ms": 3000,
        "target_words": [],
    }

    with TestClient(app) as client:
        # "separate" is a graded target that isn't on the list yet
        client.post("/results", json=PAYLOAD, headers={"X-Profile": "testing"})
        # "files" reaches its third strike, which would normally add it
        responses = [
            client.post(
                "/results",
                json={"results": [misspelled_untracked]},
                headers={"X-Profile": "testing"},
            )
            for _ in range(MISSPELL_STRIKES)
        ]

    assert db.count_drilling_words() == MAX_WEAK_WORDS
    assert responses[-1].json()["new_words"] == []
