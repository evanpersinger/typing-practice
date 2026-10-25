"""Per-day progress for the Stats charts, against a throwaway database."""

import pytest

from backend import db

pytestmark = pytest.mark.usefixtures("temp_db")


def session_at(started_at: str) -> int:
    with db._connect() as conn:
        cursor = conn.execute(
            "INSERT INTO sessions (started_at) VALUES (?)", (started_at,)
        )
        return int(cursor.lastrowid)


def points() -> list[tuple[int, int | None]]:
    """(accuracy, wpm) per day. The day strings depend on the machine's
    timezone, so the tests check the numbers and how many days there are."""
    return [(p["accuracy"], p["wpm"]) for p in db.get_daily_progress()]


def test_two_sittings_in_one_day_are_one_pooled_point() -> None:
    morning = session_at("2026-03-10 10:00:00")
    later = session_at("2026-03-10 10:30:00")
    # 50 characters in 10s is 60 wpm and in 30s is 20 wpm. Pooled it is 100
    # characters in 40s, which is 30 wpm. Averaging the two rates would say 40.
    for session_id, correct, duration_ms in [
        (morning, True, 10_000),
        (later, False, 30_000),
    ]:
        db.record_result("separate", "x", correct, session_id)
        db.record_result("separate", "x", correct, session_id)
        db.record_drill("s", "x" * 50, duration_ms, session_id)

    assert points() == [(50, 30)]


def test_a_day_without_a_timed_drill_has_no_wpm_and_empty_sessions_are_skipped() -> None:
    first = session_at("2026-03-10 10:00:00")
    second = session_at("2026-03-12 10:00:00")
    session_at("2026-03-14 10:00:00")  # opened and quit, nothing typed
    db.record_result("separate", "x", True, first)
    db.record_drill("s", "x" * 50, 10_000, first)
    db.record_result("separate", "x", True, second)

    assert points() == [(100, 60), (100, None)]
