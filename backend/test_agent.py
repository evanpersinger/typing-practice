"""A stand-in for `agent`, used by the testing profile.

Same function, same return type, no network. The real agent spends 10-30
seconds on Claude at session start, which is fine when you're practicing and
miserable when you're clicking through the UI for the tenth time to check a
button.

The sentences are fixed rather than generated, so a testing session is also
repeatable: the same words come up every time, and you always know which ones
you're about to misspell on purpose.
"""

from __future__ import annotations

from backend.agent import (
    Drill,
    GeneratedDrills,
    GeneratedPunctuationDrills,
    PunctuationDrill,
)

# Short on purpose. You're exercising the app, not practicing.
DRILLS: list[tuple[str, list[str]]] = [
    ("Keep the two files separate.", ["separate"]),
    ("That is definitely the wrong answer.", ["definitely"]),
    ("A vector is not a variable.", ["vector", "variable"]),
    ("Did you receive the invoice?", ["receive"]),
    ("This is a rare occurrence.", ["occurrence"]),
    ("The itinerary is available now.", ["itinerary", "available"]),
    ("Regular maintenance is necessary.", ["maintenance", "necessary"]),
    ("She spelled it incorrectly again.", ["incorrectly"]),
    ("Explain the difference to me.", ["difference"]),
    ("Too much caffeine is a problem.", ["caffeine"]),
]


def generate_drills(words: list[str] | None = None, count: int = 9) -> GeneratedDrills:
    """The canned set. `words` is ignored: there's no weak-word list to serve."""
    return GeneratedDrills(
        drills=[
            Drill(sentence=sentence, target_words=targets)
            for sentence, targets in DRILLS[:count]
        ]
    )


# One feature per sentence, the same rule the real prompt enforces. Eleven so
# the default nine leaves something out, the way a sampled session does.
PUNCTUATION_DRILLS: list[tuple[str, str]] = [
    ("We need eggs, milk, and bread.", "a comma separating items in a list"),
    ("After lunch, we walked to the park.", "a comma after an introductory clause"),
    ("The rain stopped; the game went on.", "a semicolon joining two independent clauses"),
    ("She had one rule: never be late.", "a colon introducing an explanation"),
    ("The well-known bakery opens at six.", "a hyphenated compound word"),
    ("I can't find my keys anywhere.", "an apostrophe in a contraction"),
    ("The dog's collar is bright red.", "an apostrophe showing possession"),
    ('"Wait for me," she said.', "quoted speech with the comma inside the closing quotation mark"),
    ("Did you lock the back door?", "a question mark"),
    ("What a great game that was!", "an exclamation mark"),
    ("We drove through Denver on the way home.", "a capitalized proper noun in the middle of the sentence"),
]


def generate_punctuation_drills(count: int = 9) -> GeneratedPunctuationDrills:
    """The canned punctuation set, first `count` in catalog order."""
    return GeneratedPunctuationDrills(
        drills=[
            PunctuationDrill(sentence=sentence, feature=feature)
            for sentence, feature in PUNCTUATION_DRILLS[:count]
        ]
    )
