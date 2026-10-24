"""The line each model call leaves in llm_calls.jsonl."""

import json
from pathlib import Path

import pytest

from backend import agent
from backend.agent import (
    Drill,
    GeneratedDrills,
    GeneratedPunctuationDrills,
    PunctuationDrill,
)

GOOD = Drill(sentence="Keep the two files separate.", target_words=["separate"])
MISSPELLED = Drill(sentence="Please keep the files seperate.", target_words=["separate"])


@pytest.fixture
def log(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "llm_calls.jsonl"
    monkeypatch.setattr(agent, "LLM_LOG", path)
    return path


def logged_lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_a_call_logs_what_the_model_returned_and_what_was_kept(
    log: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    returned = GeneratedDrills(drills=[GOOD, MISSPELLED])
    monkeypatch.setattr(agent, "_parse", lambda *args: returned)

    agent.generate_drills(["separate"])

    (line,) = logged_lines(log)
    assert line["kind"] == "practice"
    assert line["asked"] == ["separate"]
    assert line["raw"] == [GOOD.model_dump(), MISSPELLED.model_dump()]
    assert line["kept"] == [GOOD.model_dump()]
    assert line["error"] is None


def test_a_failed_call_is_logged_with_the_error_and_still_raises(
    log: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unreachable(*args: object) -> None:
        raise RuntimeError("Ollama not reachable")

    monkeypatch.setattr(agent, "_parse", unreachable)

    with pytest.raises(RuntimeError):
        agent.generate_drills(["separate"])

    (line,) = logged_lines(log)
    assert line["error"] == "RuntimeError: Ollama not reachable"
    assert line["kept"] == []


def test_a_punctuation_call_logs_the_features_it_asked_for(
    log: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sentence = PunctuationDrill(
        sentence="It is raining outside; we must stay inside.",
        feature="a semicolon joining two independent clauses",
    )
    returned = GeneratedPunctuationDrills(drills=[sentence])
    monkeypatch.setattr(agent, "_parse", lambda *args: returned)

    agent.generate_punctuation_drills([])

    (line,) = logged_lines(log)
    assert line["kind"] == "punctuation"
    assert len(line["asked"]) == 9
    assert line["kept"] == [sentence.model_dump()]


def test_a_log_that_cannot_be_written_does_not_fail_the_call(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(agent, "LLM_LOG", tmp_path / "missing" / "llm_calls.jsonl")
    returned = GeneratedDrills(drills=[GOOD])
    monkeypatch.setattr(agent, "_parse", lambda *args: returned)

    assert agent.generate_drills(["separate"]).drills == [GOOD]
