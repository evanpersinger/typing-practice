import pytest

from backend import agent, db


@pytest.fixture(autouse=True)
def isolated_llm_log(tmp_path, monkeypatch):
    """Keep tests that call the generators out of the real llm_calls.jsonl."""
    monkeypatch.setattr(agent, "LLM_LOG", tmp_path / "llm_calls.jsonl")


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """A throwaway database for the test.

    Every profile is pointed at it, so a test can't reach typing.db whichever
    profile happens to be active.
    """
    profile = db.Profile(
        db=tmp_path / "test.db",
        sessions=tmp_path / "sessions",
        seeds=(),
    )
    for name in db.PROFILES:
        monkeypatch.setitem(db.PROFILES, name, profile)
    db.init_db()
