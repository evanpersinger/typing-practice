import { Fragment, useEffect, useRef, useState } from "react";
import { addWord, fetchFreeWords } from "../api";
import { normalize } from "../grade";
import {
  FREE_CARET,
  FREE_MISS,
  FREE_PENDING,
  START_BUTTON,
  WORD_SURFACE,
  pct,
} from "../ui";

// No done phase: there's nothing to submit and nothing to report, words are
// added the moment they earn it, so ending a round drops you back on the start
// screen rather than at a summary you'd have to click through.
export type FreePhase = "idle" | "loading" | "typing";

// Miss a word twice and it's a typo; three times and it's a habit worth adding
// to the weak list. A missed word slides this far down the board rather than
// repeating straight away, so you're recalling it and not copying the line above.
const STRIKES = 3;
const REQUEUE_AFTER = 5;

// Six words to a row, the whole batch on screen at once. Rows rather than a
// grid of equal columns, because a column wide enough for the longest word
// strands a five-letter one in the middle of it: this way the rows come out
// ragged and the words sit exactly one space apart (1ch, in a mono face).
const FREE_COLUMNS = 6;

// min-w, not w-fit alone: the width would otherwise track whichever row is
// currently widest, so swapping in a new board would resize the panel. 52ch is
// set just above what rows actually reach (measured 37-48 across a board), not
// at the 71ch six 11-character words could theoretically hit, which left the
// panel a third wider than anything in it. Real boards land under this, so the
// width holds still; an unusually long one grows it, and only between rounds.
const FREE_BOARD =
  `flex w-fit min-w-[52ch] flex-col gap-y-5 ${WORD_SURFACE} ` +
  "px-10 py-8 font-mono text-[1.6rem] leading-none";

/**
 * One word on the Free Type board, drawn character by character so what you
 * typed sits on top of what you were meant to type. `typed` is null for a word
 * you haven't reached yet.
 *
 * Red is per letter and never the whole word: once you've missed something,
 * where in the word you missed it is the only part worth looking at.
 */
function FreeWord({
  word,
  typed,
  active,
}: {
  word: string;
  typed: string | null;
  active: boolean;
}) {
  if (typed === null) return <span className={FREE_PENDING}>{word}</span>;

  const attempt = typed.toLowerCase();
  const letters = [...word];
  // A letter you never reached is wrong too, but only once you've moved on:
  // while you're still on the word it's just a letter you haven't typed.
  const wrong = letters.map((char, i) =>
    i < attempt.length ? attempt[i] !== char : !active,
  );
  // Anything past the end of the word renders as itself rather than being
  // dropped: you should see what you actually typed.
  const overflow = attempt.slice(word.length);
  // Only the word under the caret has letters that are still pending: on a word
  // you've moved past, everything you never reached is already marked wrong.
  const letterClass = (i: number) =>
    wrong[i] ? FREE_MISS : i < attempt.length ? "" : FREE_PENDING;

  return (
    // Tagged so the board can scroll the word you're on back into view: it's
    // taller than the window, so the caret walks off the bottom otherwise.
    <span className="relative" data-free-caret={active ? "" : undefined}>
      {letters.map((char, i) => (
        <Fragment key={i}>
          {active && i === attempt.length && <span className={FREE_CARET} />}
          <span className={letterClass(i)}>{char}</span>
        </Fragment>
      ))}
      {/* Out of flow, or typing past the end of a word widens it and shoves
          every word after it along the row while you're mid-keystroke. */}
      {overflow && (
        <span className={`${FREE_MISS} absolute top-0 left-full`}>
          {overflow}
        </span>
      )}
      {active && attempt.length >= word.length && (
        <span className={FREE_CARET} />
      )}
    </span>
  );
}

/**
 * Everything Free Type remembers, and everything it does.
 *
 * Called from App unconditionally rather than from the component below, so
 * leaving the tab doesn't throw the board away: the JSX is what's conditional,
 * not the state. `active` is that condition, and the effects read it so they
 * stay quiet while you're on another tab.
 *
 * `setError` belongs to App because the error line is shared with every other
 * section, so this reports into it rather than keeping an error of its own.
 */
export function useFreeType(
  active: boolean,
  setError: (message: string | null) => void,
) {
  const [phase, setPhase] = useState<FreePhase>("idle");
  const [words, setWords] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  // Misses per word, this sitting only. Reset on every start: three strikes is
  // a claim about one session, not an all-time tally.
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [typedCount, setTypedCount] = useState(0);
  // Free Type's own clock, kept apart from the practice sentence clock: warming
  // up never counts as practice time. Characters rather than words, because wpm
  // here has to mean the same thing it means on the stats tab (five characters
  // to a word).
  const startedAt = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [chars, setChars] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active || phase !== "typing") return;
    // preventScroll matters: the input is sr-only and sits after the board in
    // the DOM, so a plain focus() makes the browser scroll it into view, which
    // would jump the page to the bottom of the board on every word.
    inputRef.current?.focus({ preventScroll: true });
  }, [active, phase, index]);

  // Keyed on the row, not the word: within a row nothing needs to move, so
  // this doesn't even run for five words out of six.
  const activeRow = Math.floor(index / FREE_COLUMNS);

  useEffect(() => {
    if (!active || phase !== "typing") return;
    // A fresh board starts at the top of the page rather than wherever the last
    // one left the scroll, which is halfway down by the time you finish it.
    if (index === 0) {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = document.querySelector("[data-free-caret]");
    if (!el) return;
    // Shift by exactly enough to clear the edge, never scrollIntoView: that
    // centres the row, which throws the page a third of a screen in one go and
    // loses your place. Here the board steps by about a row and stops.
    const { top, bottom } = el.getBoundingClientRect();
    const margin = 140;
    if (bottom > window.innerHeight - margin) {
      window.scrollBy({ top: bottom - (window.innerHeight - margin) });
    } else if (top < margin) {
      window.scrollBy({ top: top - margin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, phase, activeRow]);

  // Type through the board and the next one takes its place, rather than the
  // session ending out from under you.
  useEffect(() => {
    if (!active || phase !== "typing") return;
    if (index < words.length) return;
    fetchFreeWords()
      .then((next) => {
        setWords(next);
        setIndex(0);
        setAttempts([]);
      })
      .catch(() => setError("Could not load more words."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, phase, index, words.length]);

  /** Whoever clears Free Type clears all of it. A leftover miss count is a word
   *  added on its first mistake next time. */
  function reset() {
    setPhase("idle");
    setWords([]);
    setIndex(0);
    setAttempts([]);
    setCurrent("");
    setMisses({});
    setTypedCount(0);
    startedAt.current = null;
    setElapsedMs(0);
    setChars(0);
  }

  async function start() {
    setError(null);
    setPhase("loading");
    try {
      const next = await fetchFreeWords();
      if (next.length === 0) {
        setError("No words came back. Every common word is already on your list.");
        setPhase("idle");
        return;
      }
      reset();
      setWords(next);
      setPhase("typing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the backend.");
      setPhase("idle");
    }
  }

  /**
   * Grade the word you're on and move the cursor along.
   *
   * Right, and it's done for good. Wrong, and it's dealt back into the board
   * further down, pushing the last word off so the board stays ten rows. On the
   * third miss it's added to your weak list instead, because Practice takes
   * over from there and there's nothing left to learn from testing it again
   * this sitting.
   */
  async function commit() {
    const word = words[index];
    if (!word) return;
    const attempt = normalize(current);
    setCurrent("");
    setTypedCount((n) => n + 1);
    setChars((n) => n + attempt.length);
    // Read once per word rather than on a timer: the numbers move when you
    // finish a word, which is the only moment they can change anyway.
    if (startedAt.current !== null) {
      setElapsedMs(Date.now() - startedAt.current);
    }
    setIndex((i) => i + 1);
    setAttempts((all) => [...all, attempt]);
    if (attempt === word) return;

    const missed = (misses[word] ?? 0) + 1;
    setMisses({ ...misses, [word]: missed });

    if (missed < STRIKES) {
      setWords((all) => {
        // Too near the end of the board to deal it back in. The next board is
        // different words anyway, so it just doesn't come round again.
        const at = index + REQUEUE_AFTER;
        if (at >= all.length) return all;
        // Overwrite that slot rather than splicing into it. An insert shifts
        // every word after it one place along, which regroups all the rows and
        // moves words you're about to type. This swaps one word you haven't
        // reached yet and leaves every other position exactly where it was.
        const next = [...all];
        next[at] = word;
        return next;
      });
      return;
    }

    try {
      await addWord(word);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not add ${word}.`);
    }
  }

  /** Space ends a word here, the way it does when you type anything else, so it
   *  must never reach the box. It's also the only key that ends one: Enter is
   *  left alone and does nothing, so it can't bank a word you're half way
   *  through and skip the rest of it. An empty box submits nothing either: a
   *  stray space isn't a miss. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== " ") return;
    e.preventDefault();
    if (current.trim() === "") return;
    void commit();
  }

  const rows = Array.from(
    { length: Math.ceil(words.length / FREE_COLUMNS) },
    (_, row) =>
      words
        .slice(row * FREE_COLUMNS, (row + 1) * FREE_COLUMNS)
        .map((word, col) => ({ word, index: row * FREE_COLUMNS + col })),
  );

  // Live numbers, nothing stored: this is a warm-up, and a board that filters
  // out every word already on your weak list would flatter the stats tab if it
  // fed into it. Same five-characters-to-a-word rule the backend uses, so the
  // number is comparable to the one on the stats tab.
  const missCount = Object.values(misses).reduce((sum, n) => sum + n, 0);
  const wpm =
    elapsedMs > 0 ? Math.round((chars * 60000) / (5 * elapsedMs)) : 0;
  const accuracy = pct(typedCount - missCount, typedCount);

  return {
    phase,
    index,
    attempts,
    current,
    setCurrent,
    startedAt,
    inputRef,
    rows,
    wpm,
    accuracy,
    reset,
    start,
    handleKeyDown,
  };
}

export type FreeTypeState = ReturnType<typeof useFreeType>;

/** The Free Type screen. Holds nothing itself: everything it draws comes off
 *  the hook above, which App keeps alive across tab switches. */
export function FreeType({
  state,
  error,
}: {
  state: FreeTypeState;
  error: string | null;
}) {
  const {
    phase,
    index,
    attempts,
    current,
    setCurrent,
    startedAt,
    inputRef,
    rows,
    wpm,
    accuracy,
    start,
    handleKeyDown,
  } = state;

  return (
    <>
      {phase === "idle" && (
        <>
          <button className={START_BUTTON} onClick={start}>
            Start session
          </button>
          {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
        </>
      )}

      {phase === "loading" && (
        <>
          <p className="mt-0 mb-7 text-[2.4rem]">Loading words…</p>
          <div className="size-11 animate-[spin_0.8s_linear_infinite] rounded-full border-[3px] border-transparent border-t-white" />
        </>
      )}

      {phase === "typing" && (
        // Clicking anywhere on the board puts the cursor back, since the
        // input catching your keystrokes is off screen.
        <div onClick={() => inputRef.current?.focus({ preventScroll: true })}>
          {/* Above the board rather than below it: the board grows and
              shrinks with the word count, so anything under it moves. */}
          {/* These numbers change on every word, so they get a fixed
              width and no wrapping: left to size themselves, a longer
              value wraps, the column grows taller, and the whole board
              below it jumps. The width sits on the number itself, not the
              column, because ch resolves against the element's own
              font-size and only the number is set at 2.4rem. */}
          {/* A small indent off the board's left edge, well short of
              the board's own px-10: enough that the numbers don't hang off
              the corner, not so much that they read as a second column. */}
          <div className="mb-6 flex gap-12 pl-3">
            <div className="flex flex-col gap-1">
              <span className="w-[5ch] text-[2.4rem] font-semibold tabular-nums whitespace-nowrap">
                {wpm}
              </span>
              <span className="text-[1.3rem]">wpm</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="w-[5ch] text-[2.4rem] font-semibold tabular-nums whitespace-nowrap">
                {accuracy}
              </span>
              <span className="text-[1.3rem]">accuracy</span>
            </div>
          </div>
          <div className={FREE_BOARD}>
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-x-[1ch]">
                {row.map((cell) => (
                  <FreeWord
                    key={cell.index}
                    word={cell.word}
                    typed={
                      cell.index === index
                        ? current
                        : (attempts[cell.index] ?? null)
                    }
                    active={cell.index === index}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Invisible on purpose: what you type is drawn into the board
              itself, so a second copy of it in a box is just noise.
              Fixed to the corner of the viewport rather than sr-only,
              which is absolutely positioned and would sit after the board
              in the flow. The browser scrolls a focused field's own caret
              into view as you type, so from down there the first keystroke
              threw the page to the bottom of the board. Pinned in the
              viewport there's nothing left to scroll to. */}
          <input
            ref={inputRef}
            className="fixed top-0 left-0 size-px opacity-0"
            value={current}
            onChange={(e) => {
              // First keystroke starts the clock, not the board appearing,
              // so staring at it for ten seconds doesn't cost you wpm.
              if (startedAt.current === null) {
                startedAt.current = Date.now();
              }
              setCurrent(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            // Same rule as the practice box: a pasted word isn't one you
            // spelled, so it says nothing about whether you know it.
            onPaste={(e) => e.preventDefault()}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
        </div>
      )}
    </>
  );
}
