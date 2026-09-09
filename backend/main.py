"""
FastAPI app wiring the local trainer together.
"""

from __future__ import annotations

import difflib
import random
import re
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from wordfreq import top_n_list

from backend import agent, db, test_agent


def agent_for(profile: str):
    """Testing gets canned sentences and a canned analysis: same shapes, no
    Claude, so a session starts instantly instead of after a 20-second wait."""
    return test_agent if profile == "testing" else agent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Both worlds get built at boot, so picking "testing" for the first time
    # lands on a seeded word list instead of an empty one.
    for name in db.PROFILES:
        db.use_profile(name)
        db.init_db()
        for path in db.active_profile().seeds:
            db.seed_from_file(path)
    yield


# No CORS middleware: the Vite dev server proxies /api through to here, so every
# request arrives same-origin as far as the browser is concerned. The frontend's
# port is no longer this module's business.
app = FastAPI(title="Typing Practice", lifespan=lifespan)


async def use_profile(x_profile: Annotated[str, Header()] = db.DEFAULT_PROFILE) -> str:
    """Bind this request to the profile the frontend picked on the way in.

    Async on purpose: it has to run in the request's own context for the
    contextvar to still be set by the time the endpoint reads it.
    """
    try:
        db.use_profile(x_profile)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"unknown profile: {x_profile}")
    return x_profile


# Every endpoint takes this. There is no way to reach the database without
# having said which world you're in.
Profile = Annotated[str, Depends(use_profile)]


# One word and nothing else: no spaces, commas, periods or digits. The
# apostrophe and hyphen are allowed because they appear inside real words
# ("can't", "well-known"), but not at the start, so punctuation alone can't get
# through. Capitals aren't rejected — db.add_word lowercases, same as it does
# for the seed files, so "Necessary" is stored as "necessary" rather than
# bounced back at you.
WORD_PATTERN = re.compile(r"^[a-z][a-z'-]*$")
MAX_WORD_LENGTH = 40

# Matches the frontend's board (six by ten), so the cap and the thing that
# displays it can't disagree. Seeding bypasses this endpoint, so a seed list
# longer than 60 still loads.
MAX_WEAK_WORDS = 60


# Free Type draws from the most common English words by measured usage, not from
# a dictionary and not from a list anybody hand-picked. Both length bounds are
# about the board: nobody misspells "have", and a long word makes a row of them
# lopsided. That costs 11 words out of ~1400. Reusing WORD_PATTERN is what
# guarantees a word this serves can survive the round trip back through
# POST /words.
MIN_FREE_TYPE_LENGTH = 5
MAX_FREE_TYPE_LENGTH = 11
# Longer than one screen on purpose, and it grows downward: six to a row either
# way, so this is twenty rows rather than ten. A word you miss is dealt back in
# five slots ahead, so reaching three strikes needs about ten slots of runway
# after the first miss. At sixty, missing something late in the board meant it
# could never get there, and the next board is sixty fresh words out of ~1400,
# so it wasn't coming back that way either.
FREE_TYPE_BOARD = 120
FREE_TYPE_POOL = [
    word
    for word in top_n_list("en", 2000, ascii_only=True)
    if MIN_FREE_TYPE_LENGTH <= len(word) <= MAX_FREE_TYPE_LENGTH
    and WORD_PATTERN.match(word)
]


# What it takes for a word you typed wrong to start counting against you. No
# length floor on purpose: three strikes already filters out the one-off slip.
# Add one back only if the misspellings table fills with words you type fine.
MISSPELL_STRIKES = 3 # how many times to misspell a word before it gets added to weak words
MAX_MISSPELL_EDITS = 2 # set to avoid counting a different word as a misspell


def _within_edits(typed: str, expected: str, cap: int) -> bool:
    """Levenshtein distance between the two words, but only asked <= cap.

    Bailing out at `cap` is what keeps this honest on a word substitution: two
    unrelated words stop being compared after three rows instead of being scored
    in full.
    """
    if abs(len(typed) - len(expected)) > cap:
        return False

    previous = list(range(len(expected) + 1))
    for i, typed_char in enumerate(typed, start=1):
        current = [i]
        for j, expected_char in enumerate(expected, start=1):
            current.append(
                min(
                    previous[j] + 1,  # deletion
                    current[j - 1] + 1,  # insertion
                    previous[j - 1] + (typed_char != expected_char),  # substitution
                )
            )
        if min(current) > cap:
            return False
        previous = current
    return previous[-1] <= cap


def find_misspellings(sentence: str, typed: str) -> list[tuple[str, str]]:
    """Words in `sentence` you spelled wrong, as (word, what_you_typed) pairs.

    Positional alignment, same as the frontend's grader and with the same
    limitation: inserting or dropping a word shifts everything after it. A
    shifted pair reads as two unrelated words, which is exactly what the edit
    distance throws out, so the failure mode is missing a real misspelling
    rather than inventing one.
    """
    def bare(raw: str) -> str:
        return raw.strip(".,!?;:'\"").lower()

    expected_words = [bare(raw) for raw in sentence.split()]
    typed_words = [bare(raw) for raw in typed.split()]

    found: list[tuple[str, str]] = []
    for i, word in enumerate(expected_words):
        if not WORD_PATTERN.match(word):
            continue
        attempt = typed_words[i] if i < len(typed_words) else ""
        if not attempt or attempt == word:
            continue
        if _within_edits(attempt, word, MAX_MISSPELL_EDITS):
            found.append((word, attempt))
    return found


# What a punctuation miss gets filed under. Names rather than the characters
# themselves, so the stats tab can say "comma" instead of ",". A mark that isn't
# listed is filed under its own character.
MARK_NAMES = {
    ".": "period",
    ",": "comma",
    ";": "semicolon",
    ":": "colon",
    "-": "hyphen",
    "'": "apostrophe",
    '"': "quotation mark",
    "?": "question mark",
    "!": "exclamation mark",
}


def _slot_name(char: str) -> str | None:
    """What this character counts as: "space", a mark name, or None for a letter
    or digit, which this mode doesn't grade."""
    if char.isspace():
        return "space"
    if char.isalnum():
        return None
    return MARK_NAMES.get(char, char)


def _classify_pair(expected: str, typed: str) -> list[tuple[str, str]]:
    """One expected character against the one typed in its place."""
    if expected.isalpha() and typed.isalpha():
        if expected.lower() != typed.lower():
            return []  # a letter typo, which is Practice's business
        return [("capital", "missing" if expected.isupper() else "extra")]
    expected_name, typed_name = _slot_name(expected), _slot_name(typed)
    if expected_name and typed_name:
        if "space" not in (expected_name, typed_name):
            return [(expected_name, "wrong")]  # a mark, but not the right one
        # A space where a mark goes, or a mark where a space goes: one miss,
        # filed under the mark. The space is only there because of it.
        if typed_name == "space":
            return [(expected_name, "missing")]
        return [(typed_name, "extra")]
    misses = []
    if expected_name:
        misses.append((expected_name, "missing"))
    if typed_name:
        misses.append((typed_name, "extra"))
    return misses


def find_punctuation_misses(sentence: str, typed: str) -> list[tuple[str, str]]:
    """Where `typed` departs from `sentence` in punctuation, case, or spacing.

    Returned as (mark, kind) pairs: ("comma", "missing"), ("capital", "extra"),
    ("space", "extra"). A character-level diff rather than the positional word
    alignment the spelling grader uses, because the misses here are the very
    things that break a word split: a space before a period is a token of its
    own. Letter typos fall out of the diff untouched, they're Practice's job.
    """
    typed = typed.strip()
    found: list[tuple[str, str]] = []
    matcher = difflib.SequenceMatcher(None, sentence, typed)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        expected_run, typed_run = sentence[i1:i2], typed[j1:j2]
        # Same length is the only case where pairing characters up means
        # anything, and the one that catches a capital typed lowercase.
        if tag == "replace" and len(expected_run) == len(typed_run):
            for pair in zip(expected_run, typed_run):
                found.extend(_classify_pair(*pair))
            continue
        for char in expected_run:
            if name := _slot_name(char):
                found.append((name, "missing"))
        for char in typed_run:
            if name := _slot_name(char):
                found.append((name, "extra"))
    return found


class WordResult(BaseModel):
    word: str
    typed: str
    correct: bool


class DrillResult(BaseModel):
    sentence: str
    typed: str
    duration_ms: int = 0
    words: list[WordResult]


class ResultsPayload(BaseModel):
    results: list[DrillResult]


class WordPayload(BaseModel):
    word: str


class PunctuationDrillResult(BaseModel):
    sentence: str
    typed: str


class PunctuationResultsPayload(BaseModel):
    results: list[PunctuationDrillResult]


@app.get("/drills")
def get_drills(profile: Profile):
    """Session start: pick the weakest words and generate sentences for them.

    Testing skips the word list entirely. There's nothing to be weak at in a
    profile you throw away, so it goes straight to the canned sentences.
    """
    if profile == "testing":
        generated = test_agent.generate_drills()
        return {"words": [], "drills": [d.model_dump() for d in generated.drills]}

    # Roughly one target per sentence. Cram more in and the generator has to
    # double them up, which is what makes a practice sentence read like one.
    words = db.get_drilling_words(limit=7) + db.get_mastered_sample(1)
    if not words:
        return {"words": [], "drills": []}
    generated = agent.generate_drills(words)
    return {"words": words, "drills": [d.model_dump() for d in generated.drills]}


@app.get("/punctuation-drills")
def get_punctuation_drills(profile: Profile):
    """Punctuation session start: one sentence per feature, no word list involved.

    The marks you've missed most steer which features come up. Two misses is the
    floor, so one slip doesn't earn a mark a seat, and three marks is enough to
    lean on without the session turning into one thing. Marks with no feature
    behind them (a stray space, a dropped period) still show on the stats tab,
    there's just no sentence to write for them.
    """
    drillable = {mark for mark, _ in agent.PUNCTUATION_FEATURES}
    weak = [
        stat["mark"]
        for stat in db.get_punctuation_stats()
        if stat["total"] >= 2 and stat["mark"] in drillable
    ][:3]
    generated = agent_for(profile).generate_punctuation_drills(weak)
    return {"drills": [d.model_dump() for d in generated.drills]}


@app.get("/free-words")
def get_free_words(profile: Profile):
    """Free Type: common words to fish for weaknesses you don't know about yet.

    Words already on your list are filtered out. Re-drilling a known weak word is
    what Practice is for; this mode is only looking for new ones. Nothing here
    writes: a word only earns its place by being missed three times, and the
    frontend adds it through POST /words like any other.
    """
    known = {row["word"] for row in db.get_all_words()}
    pool = [word for word in FREE_TYPE_POOL if word not in known]
    return {"words": random.sample(pool, min(FREE_TYPE_BOARD, len(pool)))}


@app.post("/words")
def add_practice_word(payload: WordPayload, profile: Profile):
    """Add a word you want to practice, from the Words tab.

    Validation lives here rather than in db.py because the rules are about what
    a person is allowed to type into a box, and the answer to breaking one is an
    HTTP 400. Storage stays unopinionated: seeded and agent-suggested words go
    in through the same door without passing this check.
    """
    word = payload.word.strip().lower()
    if not word:
        raise HTTPException(status_code=400, detail="Type a word first.")
    if len(word) > MAX_WORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Keep it under {MAX_WORD_LENGTH} characters.",
        )
    if not WORD_PATTERN.match(word):
        raise HTTPException(
            status_code=400,
            detail="One word only — letters, apostrophes and hyphens.",
        )
    # Free Type adds through here too, so a word earning its third miss hits the
    # same ceiling rather than sneaking past it.
    if db.count_drilling_words() >= MAX_WEAK_WORDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Your list is full at {MAX_WEAK_WORDS} words. "
                "Master a few before adding more."
            ),
        )

    # `added` is False when the word was already tracked. Not an error: you
    # asked for it to be on the list and it is, so the UI says so and moves on.
    return {"word": word, "added": db.add_word(word, source="user")}


@app.get("/stats")
def get_stats(profile: Profile):
    """Everything the stats tab shows: per-word counters, typing speed, and
    the punctuation you keep missing."""
    return {
        "words": db.get_all_words(),
        "typing": db.get_typing_stats(),
        "punctuation": db.get_punctuation_stats(),
    }


@app.post("/results")
def submit_results(payload: ResultsPayload, profile: Profile):
    """Session end: all bookkeeping, no model call."""
    # One POST is one sitting, so the session boundary is already here in the
    # request. Nothing has to infer it from timestamps later.
    session_id = db.start_session()

    tracked = {row["word"] for row in db.get_all_words()}
    earned: list[dict] = []

    for drill in payload.results:
        db.record_drill(drill.sentence, drill.typed, drill.duration_ms, session_id)
        for word in drill.words:
            db.record_result(word.word, word.typed, word.correct, session_id)

        # Every other word in the sentence. The graded ones above are already on
        # your list; these are the ones nothing was watching, and three misses
        # is what puts one on it.
        for word, attempt in find_misspellings(drill.sentence, drill.typed):
            if word in tracked:
                continue
            if db.record_misspelling(word, attempt) < MISSPELL_STRIKES:
                continue
            db.add_word(word, source="performance")
            db.clear_misspelling(word)
            tracked.add(word)
            earned.append(
                {
                    "word": word,
                    "reason": f"you've spelled it wrong {MISSPELL_STRIKES} times, "
                    f"most recently as '{attempt}'",
                }
            )

    # Suggestions are recorded, not added. get_drilling_words ranks unattempted
    # words above everything else, so a word added here would outrank the words
    # you actually keep missing until you'd practiced it once. Five a session was
    # enough to fill most of the next session with the model's guesses. They go
    # on your list when you say so, from the recap.
    db.finish_session(session_id, earned)
    db.write_session_transcript([d.model_dump() for d in payload.results], earned)
    return {
        "new_words": earned,
        "typing": db.get_typing_stats(session_id),
    }


@app.post("/punctuation-results")
def submit_punctuation_results(payload: PunctuationResultsPayload, profile: Profile):
    """Punctuation session end: file every miss, no model call.

    Nothing here touches words, wpm, transcripts, or the sessions table: a
    punctuation session is its own thing and its rows live in their own table.
    """
    misses: list[dict] = []
    for drill in payload.results:
        for mark, kind in find_punctuation_misses(drill.sentence, drill.typed):
            db.record_punctuation_miss(mark, kind, drill.sentence, drill.typed)
            misses.append({"mark": mark, "kind": kind, "sentence": drill.sentence})
    return {"misses": misses}


@app.get("/sessions")
def list_sessions(profile: Profile):
    """Every past session, most recent first, for the Stats tab dropdown."""
    return {"sessions": db.list_sessions()}


@app.get("/sessions/{session_id}")
def get_session(session_id: int, profile: Profile):
    """One past session's full recap, same shape the results screen shows live."""
    detail = db.get_session_detail(session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="session not found")
    return detail
