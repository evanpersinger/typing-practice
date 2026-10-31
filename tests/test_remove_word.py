"""DELETE /words/{word}, end to end through the app, against a throwaway database."""

import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.main import app

pytestmark = pytest.mark.usefixtures("temp_db")

HEADERS = {"X-Profile": "testing"}


def test_removing_a_word_takes_it_off_the_list_whatever_its_case() -> None:
    db.add_word("necessary")

    with TestClient(app) as client:
        response = client.delete("/words/%20Necessary%20", headers=HEADERS)

    assert response.status_code == 200
    assert response.json() == {"word": "necessary", "removed": True}
    assert db.get_drilling_words() == []


def test_removing_a_word_that_is_not_tracked_is_a_404() -> None:
    with TestClient(app) as client:
        response = client.delete("/words/nope", headers=HEADERS)

    assert response.status_code == 404


def test_removing_a_word_twice_is_a_404_the_second_time() -> None:
    db.add_word("necessary")

    with TestClient(app) as client:
        first = client.delete("/words/necessary", headers=HEADERS)
        second = client.delete("/words/necessary", headers=HEADERS)

    assert (first.status_code, second.status_code) == (200, 404)
