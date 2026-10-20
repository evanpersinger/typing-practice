"""What the app does with practice and punctuation sentences the model got wrong."""

import pytest
from fastapi.testclient import TestClient

from backend import agent, db
from backend.agent import (
    Drill,
    GeneratedDrills,
    GeneratedPunctuationDrills,
    PunctuationDrill,
    _usable_drills,
    _usable_punctuation_drills,
)
from backend.main import app
from backend.test_agent import PUNCTUATION_DRILLS


def drill(sentence: str, *targets: str) -> Drill:
    return Drill(sentence=sentence, target_words=list(targets))


def punct(sentence: str) -> PunctuationDrill:
    return PunctuationDrill(sentence=sentence, feature="a comma")


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


def test_every_canned_punctuation_sentence_passes_the_rules() -> None:
    canned = [punct(sentence) for sentence, _ in PUNCTUATION_DRILLS]

    assert _usable_punctuation_drills(canned, len(canned)) == canned


def test_a_sentence_closing_on_a_quotation_mark_is_kept() -> None:
    quoted = punct('She said, "Go home."')

    assert _usable_punctuation_drills([quoted], 9) == [quoted]


@pytest.mark.parametrize(
    "sentence",
    [
        "She said “wait” and left.",  # curly quotes
        "We left — then stopped.",  # em dash
        "Did you lock the door ?",  # space before a mark
        "We waited - then left.",  # a dash that isn't inside a word
        "We  drove home.",  # double space
        "We drove home",  # no closing mark
        "   ",  # nothing there
    ],
)
def test_a_sentence_that_breaks_the_prompt_rules_is_dropped(sentence: str) -> None:
    assert _usable_punctuation_drills([punct(sentence)], 9) == []


def test_stray_whitespace_around_a_sentence_is_trimmed_not_dropped() -> None:
    result = _usable_punctuation_drills([punct("  We drove home. ")], 9)

    assert [d.sentence for d in result] == ["We drove home."]


def test_a_repeated_punctuation_sentence_is_dropped() -> None:
    result = _usable_punctuation_drills(
        [punct("We drove home."), punct("We drove home.")], 9
    )

    assert len(result) == 1


def test_extra_punctuation_sentences_are_trimmed_to_the_count() -> None:
    drills = [punct(f"We drove home {n}.") for n in range(5)]

    assert _usable_punctuation_drills(drills, 3) == drills[:3]


def test_punctuation_endpoint_only_returns_the_usable_ones(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    good = punct("We drove home.")
    bad = punct("We left — then stopped.")
    monkeypatch.setattr(
        agent,
        "_parse",
        lambda *args: GeneratedPunctuationDrills(drills=[bad, good]),
    )

    response = client.get("/punctuation-drills")

    assert response.status_code == 200
    assert response.json()["drills"] == [good.model_dump()]


def test_no_usable_punctuation_sentences_is_a_readable_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    bad = punct("We left — then stopped.")
    monkeypatch.setattr(
        agent, "_parse", lambda *args: GeneratedPunctuationDrills(drills=[bad])
    )

    response = client.get("/punctuation-drills")

    assert response.status_code == 502
    assert "no usable sentences" in response.json()["detail"]
