import { useState } from "react";
import { addWord, removeWord, type StatsResponse } from "../api";
import { WORD_SURFACE } from "../ui";

// A fixed 6-by-10 board: the same 60 cells whatever the word count, so the
// empty ones show how much room is left.
const WORD_COLUMNS = 6;
const WORD_ROWS = 10;
const WORD_SLOTS = WORD_COLUMNS * WORD_ROWS;

// Six 173px columns, each fitting a 14-character word. Needs an explicit width
// (table-fixed is ignored when width is auto) and shrink-0 (otherwise the flex
// row squeezes the board and clips words).
const WORD_TABLE_WIDTH = "w-[1095px] shrink-0";

// Padding lives on what's inside a cell, not the cell, so a word's button can
// fill the whole box and the empty slots keep the same height.
const CELL_PADDING = "px-2 py-3";

/**
 * Adding a word, and the note that comes back from it.
 *
 * The word list itself isn't here: it belongs to `useStats`, because this tab
 * and the stats tab read the same one. `refreshStats` is how a word added here
 * reaches it, and it's a refetch rather than a local splice because the row the
 * server stores is the normalized one, and inventing a second version of it
 * here is how the two drift apart.
 */
export function useWords(
  setError: (message: string | null) => void,
  refreshStats: () => Promise<void>,
) {
  const [draft, setDraft] = useState("");
  // Result of the last add. Separate from `error`, because "already on your
  // list" is an outcome, not a failure, and shouldn't render in red.
  const [note, setNote] = useState<string | null>(null);
  // The word clicked on the board, waiting for the Delete button. Removing is
  // two clicks on purpose: one click on a word only picks it.
  const [selected, setSelected] = useState<string | null>(null);

  /** Opening the tab clears the last visit's "added" receipt: it isn't news any
   *  more. The word list is refetched here rather than by the stats hook alone,
   *  because you can reach this tab without ever opening Stats. */
  async function open() {
    setNote(null);
    setSelected(null);
    await refreshStats();
  }

  /** Clicking the picked word again lets go of it. */
  function select(word: string) {
    setSelected((current) => (current === word ? null : word));
  }

  async function submit() {
    const word = draft.trim();
    if (!word) return;
    setError(null);
    setNote(null);
    try {
      const result = await addWord(word);
      setDraft("");
      setNote(
        result.added
          ? `Added ${result.word}.`
          : `${result.word} is already on your list.`,
      );
      await refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that word.");
    }
  }

  async function remove(word: string) {
    setError(null);
    setNote(null);
    try {
      await removeWord(word);
      setSelected(null);
      await refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that word.");
    }
  }

  return { draft, setDraft, note, selected, open, select, submit, remove };
}

export type WordsState = ReturnType<typeof useWords>;

/** The weak-word board and the add-a-word panel. The board comes off the shared
 *  stats object rather than a fetch of its own. */
export function Words({
  state,
  stats,
  error,
}: {
  state: WordsState;
  stats: StatsResponse | null;
  error: string | null;
}) {
  const { draft, setDraft, note, selected, select, submit, remove } = state;

  // Everything still in rotation. Unlike the stats tab's table this is the whole
  // list, not just the words you've missed: a word you haven't reached yet is
  // still one you need to practice. Alphabetical rather than the backend's
  // worst-first, because this is a list you scan for a word, not a ranking.
  // Sorting the filtered copy, so the order the stats tab relies on is left alone.
  const weak = (stats?.words.filter((w) => w.status === "drilling") ?? []).sort(
    (a, b) => a.word.localeCompare(b.word),
  );

  // Always 60 boxes: the board never grows or shrinks. Whatever's left after the
  // words renders empty, which is what makes "47 words, 13 to spare" readable at
  // a glance. Past 60 the extra words aren't shown — the board is the board.
  const shown = weak.slice(0, WORD_SLOTS);

  // Looked up on the board rather than trusted from state, so a pick that's no
  // longer there (another profile, a word already gone) offers no Delete.
  const picked = shown.find((w) => w.word === selected);

  const rows = Array.from({ length: WORD_ROWS }, (_, row) =>
    Array.from(
      { length: WORD_COLUMNS },
      (_, col) => shown[row * WORD_COLUMNS + col] ?? null,
    ),
  );

  return (
    <>
      {stats === null && !error && <p>Loading your words…</p>}

      {stats && (
        <section>
          {/* w-max takes its width from the widest child (the board row),
              so the heading and blurb sit flush with the board's left edge
              while the whole block stays centred in the window. */}
          <div className="mx-auto w-max max-w-full">
            <h2 className="mt-0 mb-2 text-[1.8rem] font-semibold">
              Weak Words{" "}
              <span className="font-mono">
                ({weak.length}/{WORD_SLOTS})
              </span>
            </h2>
            {/* Broken explicitly: the line width here comes from the
                board, so wrapping would put the breaks wherever it lands.
                WORD_SLOTS rather than a literal 60, so the sentence can't
                drift from the grid it describes. */}
            <p className="mt-0 mb-6 text-[1.3rem]">
              These are words you need to practice.
              <br />
              Every practice session builds its sentences out of them, so don't
              add words you're already confident in.
              <br />
              {WORD_SLOTS} words max.
            </p>

            <div className="flex items-start gap-16">
              {/* border-separate keeps each cell its own rounded box
                  instead of collapsing into shared grid lines. */}
              <table
                className={`${WORD_TABLE_WIDTH} ${WORD_SURFACE} table-fixed border-separate border-spacing-2 p-3 font-mono text-[1.15rem]`}
              >
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((entry, colIndex) => (
                        <td
                          key={colIndex}
                          className={`rounded-md border text-center whitespace-nowrap ${
                            !entry
                              ? "border-[#4a4f4c]"
                              : entry.word === selected
                                ? "border-white bg-[#ff7a70]/20 text-white"
                                : // The same red a missed word gets mid-session.
                                  // Empty slots stay dim: spare room isn't
                                  // something you're getting wrong.
                                  "border-[#ff7a70] text-[#ff7a70]"
                          }`}
                          aria-hidden={entry ? undefined : "true"}
                        >
                          {entry ? (
                            <button
                              type="button"
                              className={`block w-full cursor-pointer border-0 bg-transparent font-[inherit] text-inherit hover:underline ${CELL_PADDING}`}
                              aria-pressed={entry.word === selected}
                              onClick={() => select(entry.word)}
                            >
                              {entry.word}
                            </button>
                          ) : (
                            <div className={CELL_PADDING}> </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Fixed rather than w-max: at w-max the panel came out 409px
                  and the row overflowed the window, clipping words off the
                  board. The board can't shrink, so the panel gives. */}
              <div className="w-[230px] shrink-0 grow-0">
                <p className="mt-0 mb-2.5 text-[1.9rem]">
                  Add words you want to practice
                </p>

                {/* A form, so Enter submits without a key handler. */}
                <form
                  className="flex flex-col gap-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <input
                    className="w-full rounded-md border border-[#4a4f4c] bg-[#1e2220] px-5 py-3 font-mono text-[1.4rem] text-white outline-none placeholder:text-[#7d827e] focus:border-white"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="type any word"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <div className="flex gap-2.5">
                    {/* The one green thing in the app: it's the only button
                        that adds to your word list, and everything around it
                        is a plain white outline. */}
                    <button
                      type="submit"
                      className="flex-1 cursor-pointer rounded-md border border-[#7fb069] px-6 py-3 text-[1.9rem] text-[#7fb069] no-underline hover:bg-[#7fb069]/12"
                    >
                      Add
                    </button>
                    {/* Only once a word on the board is picked, and red like
                        the board's words. A button, not a submit, so it
                        can't fire the form. */}
                    {picked && (
                      <button
                        type="button"
                        className="cursor-pointer rounded-md border border-[#ff7a70] px-3 py-3 text-[1.5rem] text-[#ff7a70] no-underline hover:bg-[#ff7a70]/12"
                        aria-label={`Delete ${picked.word}`}
                        onClick={() => void remove(picked.word)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </form>

                {note && <p className="mt-0 mb-4 text-[1.3rem]">{note}</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      {error && <p className="mt-4 text-[#ff7a70]">{error}</p>}
    </>
  );
}
