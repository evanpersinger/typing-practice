import pytest

from backend import db


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
