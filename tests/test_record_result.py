"""Streak and mastery arithmetic in db.record_result, against a throwaway database."""

import pytest

from backend import db

pytestmark = pytest.mark.usefixtures("temp_db")


def row(word: str) -> dict:
    return next(w for w in db.get_all_words() if w["word"] == word)


def test_correct_attempt_extends_the_streak() -> None:
    db.add_word("necessary")
    db.record_result("necessary", "necessary", True)
    db.record_result("necessary", "necessary", True)

    stats = row("necessary")
    assert (stats["attempts"], stats["misses"], stats["streak"]) == (2, 0, 2)
    assert stats["status"] == "drilling"


def test_miss_counts_and_resets_the_streak() -> None:
    db.add_word("necessary")
    for _ in range(3):
        db.record_result("necessary", "necessary", True)
    db.record_result("necessary", "neccesary", False)

    stats = row("necessary")
    assert (stats["attempts"], stats["misses"], stats["streak"]) == (4, 1, 0)


def test_a_full_streak_masters_the_word() -> None:
    db.add_word("necessary")
    for _ in range(db.MASTERY_STREAK - 1):
        db.record_result("necessary", "necessary", True)
    assert row("necessary")["status"] == "drilling"

    db.record_result("necessary", "necessary", True)
    assert row("necessary")["status"] == "mastered"


def test_a_miss_pulls_a_mastered_word_back_into_rotation() -> None:
    db.add_word("necessary")
    for _ in range(db.MASTERY_STREAK):
        db.record_result("necessary", "necessary", True)
    db.record_result("necessary", "neccesary", False)

    stats = row("necessary")
    assert (stats["status"], stats["streak"]) == ("drilling", 0)


def test_an_untracked_word_starts_being_tracked() -> None:
    db.record_result("serendipity", "serendipity", True)

    stats = row("serendipity")
    assert (stats["source"], stats["attempts"]) == ("session", 1)


def test_word_is_trimmed_and_lowercased_before_it_is_stored() -> None:
    db.add_word("necessary")
    db.record_result("  Necessary ", "necessary", True)

    assert [w["word"] for w in db.get_all_words()] == ["necessary"]
    assert row("necessary")["attempts"] == 1


def test_attempt_is_logged_against_its_session() -> None:
    session_id = db.start_session()
    db.record_result("necessary", "neccesary", False, session_id)

    detail = db.get_session_detail(session_id)
    assert detail is not None
    assert detail["words"] == [
        {"word": "necessary", "typed": "neccesary", "correct": False}
    ]
