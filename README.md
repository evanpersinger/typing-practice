# Typing Practice

[![CI](https://github.com/evanpersinger/typing-practice/actions/workflows/ci.yml/badge.svg)](https://github.com/evanpersinger/typing-practice/actions/workflows/ci.yml)

A typing trainer that only drills the words *you* get wrong.

It keeps a list of words you misspell, asks an LLM to write practice sentences around them, and grades what you type. Words you keep missing stay in rotation. Words you get right ten times in a row graduate out. New words are added when you misspell them.

## How it works

**Practice tab**: Your seven weakest words rotate into 10 sentences, one target word per sentence. Enter advances only when you reach the end by length. One session lasts 10-30 seconds.

**Free Type**: A board of common English words (filtered to exclude ones you're already drilling). Space ends a word, not Enter. Miss the same word three times and it joins your weak list.

**Punctuation tab**: Nine sentences per session, each teaches exactly one punctuation feature: comma in lists, semicolon between clauses, colon before explanations, hyphenated compounds, apostrophes, quotes, question marks, exclamation marks, or possessives. Lowercase is required for capitals. No spelling graded here. Each miss goes into your stats.

## Running it

```
make install
```

Then in two terminals:

```
make backend
make frontend
```

Open the URL from `make frontend`. Needs an API key in `.env` at the repo root (see `.env.example`), unless you're running the local provider (see Setup).

Both ports are set in the `Makefile`.

## Profiles

| | Personal | Testing |
|---|---|---|
| database | `typing.db` | `typing_test.db` |
| transcripts | `sessions/` | `sessions_test/` |
| sentences | LLM-generated from your weak words | canned set from `test_agent.py` |

Separate files, not a flag. Test data cannot reach your real numbers. The backend binds each request to a profile via an `X-Profile` header; nothing is remembered client-side.

The testing profile lets you click through the UI without paying for model calls or waiting 10+ seconds per session.

## Setup

Edit `.env` at the repo root with your API key:

```
ANTHROPIC_API_KEY=your-key-here
LLM_PROVIDER=openai  # or omit this to use Anthropic by default
```

Only set the keys you're actually using. If a provider's key is missing, the server prints which variable it needs rather than crashing.

Or run it free, locally: set `LLM_PROVIDER=local` and have [Ollama](https://ollama.com) running with a text model pulled (`OLLAMA_MODEL`, defaults to `qwen3.5:4b`). No key and no internet needed, but slower and only as good as the model you've got pulled.

## Known rough edges

- Grading in `grade.ts` is positional. Drop or insert a word mid-sentence and everything after it shifts. Only affects target words, so copy-typing works fine.
- Punctuation sessions cannot detect a dropped trailing period; you must type something to submit a sentence, but that space doesn't count as the missing mark.
- Free Type clock never pauses when switching tabs; cosmetic display only, never stored.
