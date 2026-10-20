"""The two grading paths: spelling (Practice) and punctuation.

Pure functions, so no database and no fixtures.
"""

import pytest

from backend.main import (
    _classify_pair,
    _within_edits,
    find_misspellings,
    find_punctuation_misses,
    grade_drill,
    normalize,
)


@pytest.mark.parametrize(
    ("typed", "expected", "within"),
    [
        ("teh", "the", True),  # a swap is two substitutions
        ("necesary", "necessary", True),  # one letter dropped
        ("abc", "xyz", False),  # three substitutions
        ("abcd", "a", False),  # the length gap alone is over the cap
    ],
)
def test_within_edits(typed: str, expected: str, within: bool) -> None:
    assert _within_edits(typed, expected, 2) is within


def test_misspelled_word_is_reported_with_what_was_typed() -> None:
    assert find_misspellings("It is necessary.", "It is neccesary.") == [
        ("necessary", "neccesary")
    ]


def test_correct_sentence_reports_nothing() -> None:
    assert find_misspellings("It is necessary.", "It is necessary.") == []


def test_case_and_punctuation_do_not_count_as_misspellings() -> None:
    assert find_misspellings("Separate files.", "SEPARATE files,") == []


def test_a_different_word_is_not_a_misspelling() -> None:
    # Past the edit cap, so it reads as a shifted word and not a typo of this one.
    assert find_misspellings("It is necessary.", "It is banana.") == []


def test_words_that_were_never_typed_are_skipped() -> None:
    assert find_misspellings("It is necessary.", "It is") == []


def test_tokens_that_are_not_words_are_ignored() -> None:
    assert find_misspellings("Call 555 now.", "Call 556 now.") == []


def test_a_word_typed_twice_does_not_hide_a_misspelling() -> None:
    assert find_misspellings(
        "We will receive the package soon.", "We will will recieve the package soon."
    ) == [("receive", "recieve")]


def test_a_dropped_word_does_not_hide_a_misspelling() -> None:
    assert find_misspellings(
        "We will receive the package soon.", "We recieve the package soon."
    ) == [("receive", "recieve")]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Separate,", "separate"),
        ("'separate", "separate"),  # a stray apostrophe is not a spelling mistake
        ('"Wait', "wait"),
        ("(maybe)", "maybe"),
        ("can't.", "can't"),
        ("well-known,", "well-known"),
        ("café.", "café"),  # an accent is part of the word
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw) == expected


SENTENCE = "Keep the two files separate."


def grade(typed: str) -> list[dict]:
    return [r.model_dump() for r in grade_drill(SENTENCE, typed, ["separate"])]


def test_a_correct_target_is_right_and_keeps_what_was_typed() -> None:
    assert grade("Keep the two files separate.") == [
        {"word": "separate", "typed": "separate.", "correct": True}
    ]


def test_a_misspelled_target_is_wrong_and_records_the_attempt() -> None:
    assert grade("Keep the two files seperate.") == [
        {"word": "separate", "typed": "seperate.", "correct": False}
    ]


def test_case_and_punctuation_on_the_typed_word_are_ignored() -> None:
    assert grade("keep the two files SEPARATE") == [
        {"word": "separate", "typed": "SEPARATE", "correct": True}
    ]


def test_only_the_targets_are_graded_in_sentence_order() -> None:
    results = grade_drill(
        "A vector is not a variable.",
        "A vector is not a variable.",
        ["variable", "vector"],
    )

    assert [r.word for r in results] == ["vector", "variable"]


def test_an_unfinished_sentence_marks_the_target_wrong_with_nothing_typed() -> None:
    assert grade("Keep the two") == [{"word": "separate", "typed": "", "correct": False}]


def test_a_word_typed_twice_does_not_fail_a_correct_target() -> None:
    assert grade("Keep the the two files separate.") == [
        {"word": "separate", "typed": "separate.", "correct": True}
    ]


def test_a_word_typed_twice_still_catches_a_misspelled_target() -> None:
    assert grade("Keep the the two files seperate.") == [
        {"word": "separate", "typed": "seperate.", "correct": False}
    ]


def test_a_dropped_word_does_not_shift_the_target() -> None:
    assert grade("Keep two files separate.") == [
        {"word": "separate", "typed": "separate.", "correct": True}
    ]


def test_a_different_word_in_place_of_the_target_reads_as_skipped() -> None:
    # Too far from "separate" to be a typo of it, so nothing is paired with it.
    assert grade("Keep the two files apart.") == [
        {"word": "separate", "typed": "", "correct": False}
    ]


@pytest.mark.parametrize(
    ("expected", "typed", "misses"),
    [
        ("D", "d", [("capital", "missing")]),
        ("d", "D", [("capital", "extra")]),
        ("a", "b", []),  # a letter typo is Practice's business
        (":", ";", [("colon", "wrong")]),
        (",", " ", [("comma", "missing")]),  # a space where a mark goes
        (" ", ",", [("comma", "extra")]),  # a mark where a space goes
    ],
)
def test_classify_pair(
    expected: str, typed: str, misses: list[tuple[str, str]]
) -> None:
    assert _classify_pair(expected, typed) == misses


@pytest.mark.parametrize(
    ("sentence", "typed", "misses"),
    [
        (
            "We need eggs, milk, and bread.",
            "We need eggs milk, and bread.",
            [("comma", "missing")],
        ),
        (
            "The dog's collar is bright red.",
            "The dog's collar, is bright red.",
            [("comma", "extra")],
        ),
        (
            "She had one rule: never be late.",
            "She had one rule; never be late.",
            [("colon", "wrong")],
        ),
        (
            "We drove through Denver on the way.",
            "We drove through denver on the way.",
            [("capital", "missing")],
        ),
        (
            "Did you lock the back door?",
            "Did you lock the back door ?",
            [("space", "extra")],
        ),
    ],
)
def test_find_punctuation_misses(
    sentence: str, typed: str, misses: list[tuple[str, str]]
) -> None:
    assert find_punctuation_misses(sentence, typed) == misses


def test_letter_typos_are_not_punctuation_misses() -> None:
    assert (
        find_punctuation_misses(
            "She had one rule: never be late.", "She had one rule: never be lat."
        )
        == []
    )


def test_trailing_whitespace_is_ignored() -> None:
    assert find_punctuation_misses("Hello there.", "Hello there.  ") == []
