import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { fetchDrills, submitResults, type Drill } from "../api";
import { gradeDrill } from "../grade";
import {
  FREE_CARET,
  FREE_MISS,
  FREE_PENDING,
  SESSION_INTRO,
  START_BUTTON,
  WORD_SURFACE,
} from "../ui";

export type Phase = "idle" | "loading" | "typing" | "submitting";

// The practice sentence's box. Same surface as the Free Type board, deliberately:
// one app, one ground under the words. The padding is its own, because the
// sentence is set well above a board word's size and the board's px-10 reads as
// a tight margin around type that big.
const PROMPT_BOARD = `${WORD_SURFACE} px-14 py-12`;

// The sentence you're copying, drawn character by character against what you've
// typed so far. Same three states and the same caret as the Free Type board, so a
// grey letter means the same thing in both modes: one you haven't reached yet.
function PromptText({
  sentence,
  typed,
  strict = false,
}: {
  sentence: string;
  typed: string;
  strict?: boolean;
}) {
  const letters = [...sentence];
  // What you typed past the end of the sentence, rendered rather than dropped:
  // you should see what you actually typed. Inline rather than out of flow like
  // the board's, since there's nothing after the sentence for it to shove along.
  const overflow = typed.slice(letters.length);
  // Case-insensitive by default, the same as normalize() and the board: a capital
  // you typed lowercase still grades correct, so it can't render red. `strict`
  // is the punctuation tab's, where that capital is exactly the miss.
  const matches = (char: string, i: number) =>
    strict ? typed[i] === char : typed[i].toLowerCase() === char.toLowerCase();
  const letterClass = (char: string, i: number) =>
    i >= typed.length ? FREE_PENDING : matches(char, i) ? "" : FREE_MISS;

  return (
    <>
      {letters.map((char, i) => (
        <Fragment key={i}>
          {i === typed.length && <span className={FREE_CARET} />}
          <span className={letterClass(char, i)}>{char}</span>
        </Fragment>
      ))}
      {/* After the overflow, not before it: the caret sits at the end of what
          you've typed, and past the last letter that's past the overflow too. */}
      {overflow && <span className={FREE_MISS}>{overflow}</span>}
      {typed.length >= letters.length && <span className={FREE_CARET} />}
    </>
  );
}

/**
 * The board and the invisible input behind it: everything between the sentence
 * on screen and your keystrokes. Practice's first, and the punctuation tab's
 * too, because the input's attributes (no paste, no autocorrect) are exactly
 * the kind of thing that drifts when copied. Mount it with a key per sentence
 * so the input starts fresh each time.
 *
 * On the board rather than loose on the wall photo, and the only copy of the
 * sentence on screen: you type into this line, so a second copy of your own
 * text under it is just noise. Clicking anywhere on the board puts the cursor
 * back, since the input catching your keystrokes is off screen.
 */
export function SentenceBoard({
  sentence,
  typed,
  strict,
  inputRef,
  onChange,
  onKeyDown,
}: {
  sentence: string;
  typed: string;
  strict?: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={PROMPT_BOARD} onClick={() => inputRef.current?.focus()}>
      <p className="font-mono text-[2.6rem] leading-[1.6]">
        <PromptText sentence={sentence} typed={typed} strict={strict} />
      </p>
      {/* Invisible on purpose, the same as the Free Type board's: what you
          type is drawn into the sentence above. Fixed to the corner of the
          viewport, so unlike the board's there's no scroll for focusing it
          to throw: one sentence, no page under it to move. */}
      <input
        ref={inputRef}
        className="fixed top-0 left-0 size-px opacity-0"
        value={typed}
        onChange={onChange}
        onKeyDown={onKeyDown}
        // Pasting the sentence in is not typing it. It also lands a drill of
        // a few milliseconds in the database, which clears the duration
        // filter the wpm average is built on and drags that average for good.
        onPaste={(e) => e.preventDefault()}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}

/**
 * Everything a practice session remembers, and everything it does.
 *
 * Called from App unconditionally rather than from the component below, so
 * leaving the tab mid-sentence doesn't throw the session away: the JSX is what's
 * conditional, not the state. `active` is that condition.
 *
 * `stopClock` is on the returned object because it isn't only practice's to
 * call: every other tab stops this clock on the way in, so reading your stats
 * never counts as typing time.
 */
export function usePractice(
  active: boolean,
  setError: (message: string | null) => void,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [drills, setDrills] = useState<Drill[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState<string[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [current, setCurrent] = useState("");

  // Clock for the sentence on screen. Nothing displays it any more, but it's
  // still what wpm is computed from, so it has to stay honest: it counts only
  // time you spent actually typing, starting on your first keystroke rather
  // than on display, and stopping when you leave the tab. `banked` holds the
  // time from earlier runs on this same sentence, so pausing resumes instead of
  // restarting.
  const startedAt = useRef<number | null>(null);
  const banked = useRef(0);

  function stopClock() {
    if (startedAt.current === null) return;
    banked.current += Date.now() - startedAt.current;
    startedAt.current = null;
  }

  function resetClock() {
    startedAt.current = null;
    banked.current = 0;
  }

  // Put the cursor back in the box on a new sentence and on returning from the
  // Stats tab, otherwise you come back mid-sentence and type into nothing.
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && phase === "typing") inputRef.current?.focus();
  }, [active, phase, index]);

  /** Wipe every trace of the last session. Whoever clears state, clears all of
   *  it: a stale duration or a running clock leaking into the next session is
   *  the kind of bug you only notice in the numbers weeks later. */
  function reset() {
    setDrills([]);
    setTyped([]);
    setDurations([]);
    setIndex(0);
    setCurrent("");
    resetClock();
  }

  async function start() {
    setError(null);
    setPhase("loading");
    try {
      const data = await fetchDrills();
      if (data.drills.length === 0) {
        setError("No words to practice yet. Add some in the Words tab.");
        setPhase("idle");
        return;
      }
      reset();
      setDrills(data.drills);
      setPhase("typing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the backend.");
      setPhase("idle");
    }
  }

  /**
   * Submit the finished sentences.
   *
   * `count` is how many sentences you actually pressed Enter on. It's the whole
   * set on a normal run, and fewer when you end early. Only completed sentences
   * are graded: a half-typed one isn't a misspelling, it's an interruption, and
   * counting it would put a word back in rotation you never got to finish.
   */
  async function finish(
    allTyped: string[],
    allDurations: number[],
    count: number,
  ) {
    const perDrill = drills.slice(0, count).map((drill, i) => {
      const typedText = allTyped[i] ?? "";
      return {
        sentence: drill.sentence,
        typed: typedText,
        duration_ms: allDurations[i] ?? 0,
        words: gradeDrill(drill, typedText),
      };
    });
    setPhase("submitting");
    try {
      await submitResults(perDrill);
      // Straight back to the start screen, the way Free Type ends. The recap
      // this used to show is the same SessionRecap the stats tab renders from
      // the session just saved, and one screen is enough places for it to live.
      reset();
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit results.");
      setPhase("typing");
    }
  }

  /** Quit mid-session and keep the sentences you finished.
   *
   *  A sentence counts once you've pressed Enter on it, so `index` is exactly
   *  how many are real. The one on screen and everything after it is dropped.
   *  Quitting on the very first sentence means there's nothing to submit, so we
   *  skip the round trip and the model call entirely. */
  function end() {
    stopClock();
    if (index === 0) {
      reset();
      setPhase("idle");
      return;
    }
    void finish(typed, durations, index);
  }

  /** Leaving the tab mid-sentence throws the whole attempt away, no submit at
   *  all: unlike `end`, a deliberate quit that keeps what you finished, this
   *  is what happens when you wander off to another tab without meaning to
   *  end anything. Only a session you actually finish gets tracked. */
  function abandon() {
    stopClock();
    reset();
    setPhase("idle");
  }

  function nextSentence() {
    const updatedTyped = [...typed];
    updatedTyped[index] = current;
    setTyped(updatedTyped);

    stopClock();
    const updatedDurations = [...durations];
    updatedDurations[index] = banked.current;
    setDurations(updatedDurations);
    resetClock();

    setCurrent("");
    if (index + 1 >= drills.length) {
      void finish(updatedTyped, updatedDurations, drills.length);
    } else {
      setIndex(index + 1);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (startedAt.current === null) startedAt.current = Date.now();
    setCurrent(e.target.value);
  }

  /** Enter moves to the next sentence, but only once you've reached the end of
   *  this one. Length, not correctness: a sentence typed wrong is still a
   *  sentence you typed, and grading it is the whole point. Short of the end it
   *  does nothing, and the letters still unlit past the caret say why. */
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (current.length < drills[index].sentence.length) return;
    nextSentence();
  }

  return {
    phase,
    drills,
    index,
    current,
    inputRef,
    start,
    end,
    abandon,
    reset,
    stopClock,
    handleChange,
    handleKeyDown,
  };
}

export type PracticeState = ReturnType<typeof usePractice>;

/** The practice screen. Holds nothing itself: everything it draws comes off the
 *  hook above, which App keeps alive across tab switches. */
export function Practice({
  state,
  error,
}: {
  state: PracticeState;
  error: string | null;
}) {
  const {
    phase,
    drills,
    index,
    current,
    inputRef,
    start,
    handleChange,
    handleKeyDown,
  } = state;

  return (
    <>
      {phase === "idle" && (
        <>
          <button className={START_BUTTON} onClick={start}>
            Start session
          </button>
          <p className={SESSION_INTRO}>
            These sentences include the words you need to practice. Type one
            sentence at a time. Your results are saved when the session ends,
            and the stats tab has them.
          </p>
          {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
        </>
      )}

      {/* The model is writing your sentences, which takes a while. The
          spinner is the only thing on screen that says so. */}
      {phase === "loading" && (
        <>
          <p className="mt-0 mb-7 text-[2.4rem]">Starting session…</p>
          {/* One white arc on an invisible ring, rather than a white
              circle over a gray one. Same reason everything else here is
              pure white: no gray anywhere. */}
          <div className="size-11 animate-[spin_0.8s_linear_infinite] rounded-full border-[3px] border-transparent border-t-white" />
        </>
      )}

      {phase === "typing" && drills[index] && (
        <>
          <SentenceBoard
            key={index}
            sentence={drills[index].sentence}
            typed={current}
            inputRef={inputRef}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
        </>
      )}

      {phase === "submitting" && <p>Checking your typing…</p>}
    </>
  );
}
