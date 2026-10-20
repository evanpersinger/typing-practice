"""The two grading paths: spelling (Practice) and punctuation.

Pure functions, so no database and no fixtures.
"""

import pytest

from backend.main import (
    _classify_pair,
    _within_edits,
    find_misspellings,
    find_punctuation_misses,
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
