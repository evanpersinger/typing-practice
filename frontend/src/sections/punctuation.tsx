import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  fetchPunctuationDrills,
  submitPunctuationResults,
  type PunctuationDrill,
} from "../api";
import { START_BUTTON } from "../ui";
import { SentenceBoard, type Phase } from "./practice";

/**
 * Everything a punctuation session remembers, and everything it does.
 *
 * Practice's shape without the clock: nothing here is timed, so there's no wpm
 * to keep honest and no duration to store. Called from App unconditionally for
 * the same reason Practice is, so leaving the tab mid-sentence keeps the
 * session. `active` is what the JSX switches on.
 */
export function usePunctuation(
  active: boolean,
  setError: (message: string | null) => void,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [drills, setDrills] = useState<PunctuationDrill[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && phase === "typing") inputRef.current?.focus();
  }, [active, phase, index]);

  function reset() {
    setDrills([]);
    setTyped([]);
    setIndex(0);
    setCurrent("");
  }

  async function start() {
    setError(null);
    setPhase("loading");
    try {
      const data = await fetchPunctuationDrills();
      if (data.drills.length === 0) {
        setError("No sentences came back. Try again.");
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

  /** Submit the sentences you pressed Enter on. Same rule as Practice: a
   *  half-typed sentence is an interruption, not a pile of missing marks, so
   *  only `count` of them go. Straight back to the start screen after. */
  async function finish(allTyped: string[], count: number) {
    const results = drills.slice(0, count).map((drill, i) => ({
      sentence: drill.sentence,
      typed: allTyped[i] ?? "",
    }));
    setPhase("submitting");
    try {
      await submitPunctuationResults(results);
      reset();
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit results.");
      setPhase("typing");
    }
  }

  /** Quit mid-session and keep the sentences you finished. On the very first
   *  one there's nothing to keep, so skip the round trip. */
  function end() {
    if (index === 0) {
      reset();
      setPhase("idle");
      return;
    }
    void finish(typed, index);
  }

  function nextSentence() {
    const updatedTyped = [...typed];
    updatedTyped[index] = current;
    setTyped(updatedTyped);
    setCurrent("");
    if (index + 1 >= drills.length) {
      void finish(updatedTyped, drills.length);
    } else {
      setIndex(index + 1);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setCurrent(e.target.value);
  }

  /** The same gate as Practice: Enter only once you've reached the end of the
   *  sentence, by length rather than correctness. */
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
    reset,
    handleChange,
    handleKeyDown,
  };
}

export type PunctuationState = ReturnType<typeof usePunctuation>;

/** The punctuation screen: Practice's screens with a strict board, so a capital
 *  typed lowercase lights up red here. That capital is the whole exercise. */
export function Punctuation({
  state,
  error,
}: {
  state: PunctuationState;
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
          {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
        </>
      )}

      {phase === "loading" && (
        <>
          <p className="mt-0 mb-7 text-[2.4rem]">Starting session…</p>
          <div className="size-11 animate-[spin_0.8s_linear_infinite] rounded-full border-[3px] border-transparent border-t-white" />
        </>
      )}

      {phase === "typing" && drills[index] && (
        <>
          <SentenceBoard
            key={index}
            sentence={drills[index].sentence}
            typed={current}
            strict
            inputRef={inputRef}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
        </>
      )}

      {phase === "submitting" && <p>Checking your punctuation…</p>}
    </>
  );
}
