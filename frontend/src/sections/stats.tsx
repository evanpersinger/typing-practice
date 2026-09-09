import { useState } from "react";
import {
  fetchSessionDetail,
  fetchSessions,
  fetchStats,
  type NewWord,
  type SessionDetail,
  type SessionSummary,
  type StatsResponse,
  type TypingStats,
  type WordResult,
} from "../api";
import { pct } from "../ui";

// Section headings: separated from body text by weight and size alone, never by
// dimming. Every bit of body text stays pure white.
const HEADING = "mt-0 mb-2.5 text-[1.1rem] font-semibold";

// Both stats tables. The cell rules stay on the table via [&_th]/[&_td] rather
// than being repeated on every cell, which is how they read as one rule instead
// of thirty copies.
const TABLE =
  "w-full border-collapse text-[1.1rem] " +
  "[&_th]:border-b [&_th]:border-[#7d827e] [&_th]:py-2 [&_th]:pr-3 [&_th]:pl-0 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border-b [&_td]:border-[#3f4441] [&_td]:py-2 [&_td]:pr-3 [&_td]:pl-0";

interface WordRecap {
  word: string;
  attempts: number;
  correct: number;
  typos: string[];
}

/**
 * Collapse a session's raw word results into one row per word. A word can come
 * up in more than one sentence, so it can be both hit and missed in the same
 * session, and the row has to say so rather than pick a side.
 *
 * The typos are the point of this table. Everywhere else in the app a miss is
 * just a number; here it's the actual thing you wrote.
 */
function recapWords(results: WordResult[]): WordRecap[] {
  const byWord = new Map<string, WordRecap>();

  for (const result of results) {
    const recap = byWord.get(result.word) ?? {
      word: result.word,
      attempts: 0,
      correct: 0,
      typos: [],
    };
    recap.attempts += 1;
    if (result.correct) {
      recap.correct += 1;
    } else if (result.typed && !recap.typos.includes(result.typed)) {
      recap.typos.push(result.typed);
    }
    byWord.set(result.word, recap);
  }

  // Worst first: the words you missed are why you're on this screen.
  return [...byWord.values()].sort(
    (a, b) =>
      b.attempts - b.correct - (a.attempts - a.correct) ||
      a.word.localeCompare(b.word),
  );
}

// SQLite hands back UTC with a space instead of a "T", so "Z" is appended
// before parsing rather than letting the browser read it as local time.
function formatSessionDate(startedAt: string): string {
  const date = new Date(`${startedAt.replace(" ", "T")}Z`);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The score/word-table recap for one past session, pulled up from the dropdown
 * on this tab. Practice used to render this too, on a screen that came up the
 * moment you finished; that screen is gone, and this is the only place it
 * lives now.
 */
function SessionRecap({
  words,
  typing,
  newWords,
}: {
  words: WordResult[];
  typing: TypingStats;
  newWords: NewWord[];
}) {
  const correctCount = words.filter((w) => w.correct).length;
  const recap = recapWords(words);

  return (
    <>
      {/* No headings: each line is one sentence that says what it is, so a
          label above it is a word you read for nothing. One section rather than
          one per line, or the gaps read as breaks between sections instead of
          lines of the same score. Gap on the section, not margins on each line,
          so the spacing is stated once. */}
      <section className="flex flex-col gap-1.5 text-[1.4rem]">
        <p className="m-0">
          You spelled <b>{correctCount}</b> of {words.length} target words right
        </p>
        <p className="m-0">
          <b>{pct(correctCount, words.length)}</b> accuracy
        </p>
        <p className="m-0">
          <b>{typing.avg_wpm}</b> wpm average
        </p>
      </section>

      <section>
        <h2 className={HEADING}>words you practiced</h2>
        <table className={TABLE}>
          <thead>
            <tr>
              <th>word</th>
              <th>right</th>
              <th>you typed</th>
            </tr>
          </thead>
          <tbody>
            {recap.map((w) => (
              <tr key={w.word}>
                <td className="font-mono">{w.word}</td>
                <td>
                  {w.correct} of {w.attempts}
                </td>
                {/* A missed word with nothing typed is a sentence you
                    cut short, which is worth seeing as its own thing
                    rather than as a blank cell. */}
                <td className="font-mono">
                  {w.correct === w.attempts
                    ? "✓"
                    : w.typos.length > 0
                      ? w.typos.join(", ")
                      : "nothing"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {newWords.length > 0 && (
        <section>
          {/* Words you put on the list yourself, by misspelling them three
              times. Nothing here was nominated: the model stopped suggesting
              words because a word you've never typed outranks, next session,
              every word you actually keep getting wrong. */}
          <h2 className={HEADING}>added from your misses</h2>
          {newWords.map((w) => (
            <p key={w.word} className="my-1.5">
              <b className="font-mono">{w.word}</b> {w.reason}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

/**
 * The stats behind two tabs, not one.
 *
 * `data` is the whole word list plus the all-time typing numbers, and the Words
 * tab reads the same object: one fetch, one copy, so the two screens can't
 * disagree about what's on your list. That's why this hook lives in App rather
 * than inside either screen, and why `refresh` is on the way out.
 *
 * The session dropdown is this tab's alone, so `sessions` and the selected
 * detail stay here.
 */
export function useStats(setError: (message: string | null) => void) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  /** Just the word list and the totals. What the Words tab needs, and what a
   *  newly added word has to land in. */
  async function refresh() {
    try {
      setData(await fetchStats());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your words.");
    }
  }

  /** Both halves at once, for the tab that shows the session dropdown. */
  async function open() {
    try {
      const [stats, sessionList] = await Promise.all([
        fetchStats(),
        fetchSessions(),
      ]);
      setData(stats);
      setSessions(sessionList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load stats.");
    }
  }

  /** Pull up one past session's recap. Clears the old one first so switching
   *  sessions never shows stale data under the newly picked date while the
   *  fetch is still in flight. */
  async function selectSession(id: number | "") {
    setSelectedId(id);
    setDetail(null);
    if (id === "") return;
    try {
      setDetail(await fetchSessionDetail(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that session.");
    }
  }

  function reset() {
    setData(null);
    setSessions(null);
    setSelectedId("");
    setDetail(null);
  }

  return { data, sessions, selectedId, detail, refresh, open, selectSession, reset };
}

export type StatsState = ReturnType<typeof useStats>;

/** The stats screen: all-time numbers, the words you miss most, and one past
 *  session pulled up from the dropdown. */
export function Stats({
  state,
  error,
}: {
  state: StatsState;
  error: string | null;
}) {
  const { data, sessions, selectedId, detail, selectSession } = state;

  // Only words you have actually typed. A seeded word you've never seen says
  // nothing about your spelling, and right now forty of the forty are seeds.
  const drilled = data?.words.filter((w) => w.attempts > 0) ?? [];
  const totalAttempts = drilled.reduce((sum, w) => sum + w.attempts, 0);
  const totalMisses = drilled.reduce((sum, w) => sum + w.misses, 0);

  // Every word with at least one miss, worst first. No cap: this table is
  // the one place the app tells you what to work on, not a highlight reel.
  const missed = drilled
    .filter((w) => w.misses > 0)
    .sort((a, b) => b.misses - a.misses || b.attempts - a.attempts);

  return (
    <>
      {data === null && !error && <p>Loading your stats…</p>}

      {data && (
        <div className="flex flex-col gap-8">
          <section>
            {/* Bigger than the HEADING used by the sections below it:
                this one labels the whole tab, not a section, and says the
                numbers under it are all-time rather than per-session. */}
            <h2 className="mt-0 mb-2.5 text-[2.6rem] font-semibold">Total</h2>
            <div className="flex gap-12">
              <div className="flex flex-col gap-1">
                <span className="text-[2rem] font-semibold">
                  {pct(totalAttempts - totalMisses, totalAttempts)}
                </span>
                <span className="text-[1.1rem]">accuracy</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[2rem] font-semibold">
                  {data.typing.avg_wpm}
                </span>
                <span className="text-[1.1rem]">avg wpm</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className={HEADING}>words you struggle with</h2>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th>word</th>
                  <th>missed</th>
                  <th>attempts</th>
                  <th>miss rate</th>
                </tr>
              </thead>
              <tbody>
                {missed.map((w) => (
                  <tr key={w.word}>
                    <td className="font-mono">{w.word}</td>
                    <td>{w.misses}</td>
                    <td>{w.attempts}</td>
                    <td>{pct(w.misses, w.attempts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className={HEADING}>punctuation you struggle with</h2>
            {/* Worst first, the way the backend sends it. The three kinds
                are spelled out rather than named missing/extra/wrong, since
                "wrong one" says what happened and "wrong" alone doesn't. */}
            <table className={TABLE}>
              <thead>
                <tr>
                  <th>mark</th>
                  <th>missed</th>
                  <th>left out</th>
                  <th>added</th>
                  <th>wrong one</th>
                </tr>
              </thead>
              <tbody>
                {data.punctuation.map((p) => (
                  <tr key={p.mark}>
                    <td>{p.mark}</td>
                    <td>{p.total}</td>
                    <td>{p.missing}</td>
                    <td>{p.extra}</td>
                    <td>{p.wrong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className={HEADING}>sessions</h2>
            {/* Matches the typing input's look, so the dropdown reads as
                part of the same UI instead of an unstyled browser
                control. font-family: inherit, not Tailwind's sans stack,
                to keep the app's face. */}
            <select
              className="rounded-lg border border-[#4a4f4c] bg-[#1e2220] px-3.5 py-2.5 text-[1.3rem] text-white [font-family:inherit] focus:border-white focus:outline-none"
              value={selectedId}
              onChange={(e) =>
                selectSession(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            >
              <option value="">Select a session…</option>
              {sessions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatSessionDate(s.started_at)}
                </option>
              ))}
            </select>

            {selectedId !== "" &&
              (detail && detail.id === selectedId ? (
                <div className="mt-7 flex flex-col gap-7 leading-[1.6]">
                  <SessionRecap
                    words={detail.words}
                    typing={detail.typing}
                    newWords={detail.new_words}
                  />
                </div>
              ) : (
                <p className="mt-7">Loading session…</p>
              ))}
          </section>
        </div>
      )}

      {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
    </>
  );
}
