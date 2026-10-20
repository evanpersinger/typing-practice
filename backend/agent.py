"""The one model call in the app: writing a session's practice sentences.

Nothing here touches the keystroke loop, the app only calls this at session
start. Set LLM_PROVIDER in .env to pick which provider runs it.
"""

from __future__ import annotations

import logging
import os
import random
import re
from pathlib import Path
from typing import TypeVar

import requests
from anthropic import Anthropic
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")  # picks up LLM_PROVIDER and both API keys

logger = logging.getLogger(__name__)

# Model each provider uses for both calls, and the alternatives:
#
# Anthropic:
# claude-opus-4-6            Opus 4.6  - most advanced, most expensive
# claude-sonnet-5            Sonnet 5  - strong all-rounder
# claude-haiku-4-5-20251001  Haiku 4.5 - cheapest model
#
# OpenAI:
# gpt-5             full model, better prose, slower and pricier
# gpt-5-mini        middle option, closest match to Haiku
# gpt-5-nano        smallest and cheapest
#
# Local (Ollama, free, no API key, no internet):
# qwen3.5:4b        default, lighter sibling of qwen3.5:9b, pulled for this
# gemma4:12b        also pulled locally, pure text rather than vision
# qwen3.5:9b        also pulled locally, heavier, strained this machine
MODELS = {
    "anthropic": "claude-haiku-4-5-20251001", # haiku 4.5
    "openai": "gpt-5-nano", # gpt 5-nano
}

# The env var each provider's SDK reads its key from. Checked up front so a
# missing key says which one is missing, instead of surfacing as an SDK error
# halfway through a session. Local has no entry: Ollama needs no key at all.
KEY_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
}

# Where the local Ollama daemon listens, and which pulled model to ask it for.
# Override either in .env if your setup differs.
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")

# Anthropic stays the default, so an existing .env keeps working untouched.
PROVIDER = os.getenv("LLM_PROVIDER", "anthropic").strip().lower()

_client: Anthropic | OpenAI | None = None


def _get_client() -> Anthropic | OpenAI:
    """Build the client on first use so the server can boot without a key set."""
    global _client
    if _client is None:
        if PROVIDER not in MODELS:
            raise RuntimeError(
                f"LLM_PROVIDER is {PROVIDER!r}, expected one of "
                f"{sorted([*MODELS, 'local'])}."
            )
        if not os.getenv(KEY_VARS[PROVIDER]):
            raise RuntimeError(
                f"LLM_PROVIDER is {PROVIDER!r} but {KEY_VARS[PROVIDER]} is not set. "
                "Add it to .env at the repo root."
            )
        # Each SDK reads its own key from the environment.
        _client = Anthropic() if PROVIDER == "anthropic" else OpenAI()
    return _client


T = TypeVar("T", bound=BaseModel)


def _parse_local(prompt: str, output_format: type[T]) -> T:
    """The local path: Ollama's own REST API instead of an SDK, no client and no key.

    `format` is `output_format`'s JSON schema, which Ollama uses to constrain
    decoding rather than just asking nicely for JSON, the same structured-output
    guarantee `messages.parse`/`responses.parse` give the other two providers.
    """
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "format": output_format.model_json_schema(),
                "stream": False,
                # Deterministic, same reasoning as every other provider here:
                # this is a structured drill, not a conversation.
                "options": {"temperature": 0},
            },
            timeout=120,
        )
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        raise RuntimeError(
            f"Ollama not reachable at {OLLAMA_HOST}. Run `ollama serve` "
            "(or open the Ollama app)."
        ) from e

    return output_format.model_validate_json(response.json()["message"]["content"])


def _parse(prompt: str, max_tokens: int, output_format: type[T]) -> T:
    """One structured-output call, forced into `output_format`.

    The prompts are identical whichever provider is running, only the parse
    mechanics differ, so the branch lives here and nowhere else.
    """
    if PROVIDER == "local":
        return _parse_local(prompt, output_format)

    client = _get_client()
    model = MODELS[PROVIDER]

    if isinstance(client, Anthropic):
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
            output_format=output_format,
        )
        return response.parsed_output

    # High effort is what stops the smaller models writing the misspelling into
    # the practice sentence, and the headroom covers what that reasoning costs:
    # these models spend output tokens thinking before they write anything, so
    # the cap that's comfortable for Claude comes back empty.
    response = client.responses.parse(
        model=model,
        max_output_tokens=max_tokens + 8000,
        reasoning={"effort": "high"},
        input=prompt,
        text_format=output_format,
    )
    if response.output_parsed is None:
        raise RuntimeError(f"{model} returned no parsed output (likely a refusal).")
    return response.output_parsed


# structured output shapes (the model is forced to return exactly these)

class Drill(BaseModel):
    sentence: str
    target_words: list[str]


class GeneratedDrills(BaseModel):
    drills: list[Drill]


# The punctuation stripped from around a word before it's compared, the same rule
# as normalize() in frontend/src/grade.ts. Keep the two in step: a target this
# accepts has to be one the grader can find, or the drill grades nothing.
_EDGE_PUNCTUATION = re.compile(r"^[^a-z0-9']+|[^a-z0-9']+$")


def _normalize(word: str) -> str:
    return _EDGE_PUNCTUATION.sub("", word.lower())


def _usable_drills(drills: list[Drill], count: int) -> list[Drill]:
    """Keep the drills the app can actually use, and say why the rest went.

    Nothing the model returns is trusted. A target word missing from its sentence
    means the drill grades nothing, and it usually means the model wrote the word
    wrong or in another form, which is worse: the sentence would teach it.
    Whether a drill was good enough to keep isn't something to retry for, so
    this only filters.
    """
    kept: list[Drill] = []
    seen: set[str] = set()
    for drill in drills:
        in_sentence = {_normalize(token) for token in drill.sentence.split()}
        targets = [_normalize(target) for target in drill.target_words]
        sentence = drill.sentence.strip().lower()
        if not targets:
            reason = "it has no target words"
        elif "" in targets:
            reason = "it has an empty target word"
        elif not all(target in in_sentence for target in targets):
            reason = "a target word is not in the sentence"
        elif sentence in seen:
            reason = "it repeats an earlier sentence"
        else:
            seen.add(sentence)
            kept.append(drill)
            continue
        logger.warning("dropped a practice sentence, %s: %r", reason, drill.sentence)
    return kept[:count]


def generate_drills(words: list[str], count: int = 9) -> GeneratedDrills:
    joined = ", ".join(words)
    prompt = (
        f"Write {count} English typing-practice items of mixed length and form: "
        "some short phrases (4-7 words), some medium sentences (8-13), and some longer "
        "ones (13-18). Vary them so the set feels random. "
        f"Weave in these words the user commonly misspells, spread across the set so "
        f"each word appears at least once: {joined}. "
        "Keep them everyday and easy to read. "
        "For each item, list which of the target words it contains."
    )
    generated = _parse(prompt, 1000, GeneratedDrills)
    drills = _usable_drills(generated.drills, count)
    if not drills:
        raise RuntimeError("The model returned no usable sentences. Try again.")
    return GeneratedDrills(drills=drills)


# punctuation practice

# One feature per sentence, on purpose: you're learning where a semicolon goes,
# not juggling four rules at once. The capital that opens a sentence and the
# mark that closes it are the baseline every sentence has, so neither counts as
# a feature. Question and exclamation marks are the exception, since there the
# closing mark is the thing being practiced.
#
# Each feature is filed under the mark the grader reports it as (MARK_NAMES in
# main.py), which is how a mark you keep missing finds its sentences.
PUNCTUATION_FEATURES: list[tuple[str, str]] = [
    ("comma", "a comma separating items in a list"),
    ("comma", "a comma after an introductory clause"),
    ("semicolon", "a semicolon joining two independent clauses"),
    ("colon", "a colon introducing an explanation"),
    ("hyphen", "a hyphenated compound word"),
    ("apostrophe", "an apostrophe in a contraction"),
    ("apostrophe", "an apostrophe showing possession"),
    ("quotation mark", "quoted speech with the comma inside the closing quotation mark"),
    ("question mark", "a question mark"),
    ("exclamation mark", "an exclamation mark"),
    ("capital", "a capitalized proper noun in the middle of the sentence"),
]


class PunctuationDrill(BaseModel):
    sentence: str
    feature: str


class GeneratedPunctuationDrills(BaseModel):
    drills: list[PunctuationDrill]


def generate_punctuation_drills(
    weak_marks: list[str], count: int = 9
) -> GeneratedPunctuationDrills:
    """Punctuation session: one sentence per feature, nothing else in it.

    `weak_marks` are the marks you miss most, worst first. Their features go
    into the session first so it can't drop them, and the rest of the catalog
    fills the remaining slots at random so it isn't the same nine every time.
    Nothing repeats. The prompt names the weak marks too, so those sentences
    give you more of the mark to get wrong.
    """
    weak = [f for mark in weak_marks for m, f in PUNCTUATION_FEATURES if m == mark]
    rest = [f for _, f in PUNCTUATION_FEATURES if f not in weak]
    random.shuffle(rest)
    features = (weak + rest)[:count]
    listed = "\n".join(f"{i}. {feature}" for i, feature in enumerate(features, start=1))
    focus = (
        f"The user most often gets these wrong: {', '.join(weak_marks)}. Where "
        "the feature allows it, give those sentences more than one instance of "
        "it, such as a longer list or two possessives. "
        if weak_marks
        else ""
    )
    prompt = (
        f"Write {len(features)} English typing-practice sentences of mixed length "
        "(5 to 16 words), one for each item below, in order. Each sentence must "
        "use exactly the one feature it is written for and no other punctuation "
        "beyond the capital letter that opens it and the mark that closes it. "
        + focus
        + "Rules: straight ASCII quotation marks and apostrophes only; one space "
        "after every mark and never a space before one; no dashes of any kind "
        "except the hyphen inside a compound word; every sentence ends with a "
        "period, question mark, or exclamation mark. Keep them everyday and easy "
        "to read. Return each sentence with its feature written exactly as "
        "listed.\n\n" + listed
    )
    return _parse(prompt, 1000, GeneratedPunctuationDrills)
