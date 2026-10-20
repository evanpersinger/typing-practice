"""What the app does with practice sentences the model got wrong."""

import pytest
from fastapi.testclient import TestClient

from backend import agent, db
from backend.agent import Drill, GeneratedDrills, _usable_drills
from backend.main import app


def drill(sentence: str, *targets: str) -> Drill:
    return Drill(sentence=sentence, target_words=list(targets))


def test_a_good_drill_is_kept() -> None:
    good = drill("Keep the two files separate.", "separate")

    assert _usable_drills([good], 9) == [good]


def test_case_and_punctuation_around_a_target_do_not_matter() -> None:
    good = drill("Separate, please.", "separate")

    assert _usable_drills([good], 9) == [good]


@pytest.mark.parametrize(
    "bad",
    [
        drill("Please keep the files seperate.", "separate"),  # misspelled in the sentence
        drill("She is receiving the invoice.", "receive"),  # another form of the word
        drill("Keep the files apart.", "separate"),  # not in the sentence at all
        drill("A vector is not a variable.", "vector", "scalar"),  # one of two missing
        drill("Nothing to grade here."),  # no targets
        drill("Nothing to grade — here.", ""),  # an empty target
    ],
)
def test_a_drill_the_grader_could_not_use_is_dropped(bad: Drill) -> None:
    assert _usable_drills([bad], 9) == []


def test_a_repeated_sentence_is_dropped_and_the_first_kept() -> None:
    first = drill("Keep the two files separate.", "separate")
    repeat = drill("keep the two files separate.", "separate")

    assert _usable_drills([first, repeat], 9) == [first]


def test_extra_drills_are_trimmed_to_the_count() -> None:
    drills = [drill(f"Word number {n} is separate.", "separate") for n in range(5)]

    assert _usable_drills(drills, 3) == drills[:3]


def test_bad_drills_are_logged_with_the_reason(caplog: pytest.LogCaptureFixture) -> None:
    _usable_drills([drill("Please keep the files seperate.", "separate")], 9)

    assert "a target word is not in the sentence" in caplog.text
    assert "seperate" in caplog.text


@pytest.fixture
def client(temp_db: None) -> TestClient:
    db.add_word("separate")
    return TestClient(app)


def test_drills_endpoint_only_returns_the_usable_ones(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    good = drill("Keep the two files separate.", "separate")
    bad = drill("Please keep the files seperate.", "separate")
    monkeypatch.setattr(
        agent, "_parse", lambda *args: GeneratedDrills(drills=[bad, good])
    )

    response = client.get("/drills")

    assert response.status_code == 200
    assert response.json()["drills"] == [good.model_dump()]


def test_nothing_usable_is_a_readable_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    bad = drill("Please keep the files seperate.", "separate")
    monkeypatch.setattr(agent, "_parse", lambda *args: GeneratedDrills(drills=[bad]))

    response = client.get("/drills")

    assert response.status_code == 502
    assert "no usable sentences" in response.json()["detail"]
