import { useState } from "react";
import { setProfile, type Profile } from "./api";
import { FreeType, useFreeType } from "./sections/freeType";
import { Practice, usePractice } from "./sections/practice";
import { Punctuation, usePunctuation } from "./sections/punctuation";
import { Roadmap } from "./sections/roadmap";
import { Stats, useStats } from "./sections/stats";
import { Words, useWords } from "./sections/words";

type Tab = "practice" | "punctuation" | "stats" | "words" | "free" | "roadmap";

// The four nav buttons. Boxes rather than underlined text, so the active one is
// a faint fill instead of a border: the border is on all four now. Only the
// inactive ones take a hover fill, since two bg utilities on one element resolve
// by stylesheet order and the active tab would flicker lighter on hover.
// Warm sand rather than white, so the chrome you navigate with never reads as
// the words you're being tested on. The literal has to be written out at each
// use: Tailwind scans the source for class strings, so a colour interpolated
// from a variable never gets a rule generated for it.
// nowrap because six tabs is enough for the absolute nav to run out of width,
// and the first thing to give was "Free Type" breaking over two lines.
const TAB =
  "cursor-pointer rounded-lg border border-[#c2a878] px-6 py-2.5 " +
  "text-[1.8rem] whitespace-nowrap text-[#c2a878] no-underline";
const TAB_ON = `${TAB} bg-[#c2a878]/15`;
const TAB_OFF = `${TAB} hover:bg-[#c2a878]/8`;

// The way out of whichever session you're in. Pinned to the bottom-right so it
// sits opposite the intro blurb and out of the way of the words: a way out, not
// an invitation.
const END_BUTTON =
  "absolute right-10 bottom-7 cursor-pointer rounded-lg border border-white " +
  "px-8 py-3.5 text-[1.4rem] text-white no-underline hover:bg-white/8";

// What the mode you're on is for, and what you do. Pinned to the corner opposite
// the profile button and sized like the tab bar, because it's chrome rather than
// body text. The width cap keeps it off the card behind it. Blue for the same
// reason the tabs are sand: chrome shouldn't read as the words you're typing.
const INTRO =
  "absolute top-7 left-10 m-0 max-w-[280px] text-[1.3rem] leading-[1.45] " +
  "text-[#78a2c2]";

export default function App() {
  // Null until you've picked one, which is the whole point: there's no default
  // to fall through, so nothing can be read or written before you've said which
  // world you're in.
  const [profile, setActiveProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("practice");
  const [error, setError] = useState<string | null>(null);
  // Free Type keeps its own state in its own file. Called here rather than
  // inside the component so leaving the tab doesn't throw the board away:
  // only the JSX below is conditional, never the state.
  const practice = usePractice(tab === "practice", setError);
  const freeType = useFreeType(tab === "free", setError);
  // Practice's shape without the clock, called here for the same reason:
  // the tab's JSX is conditional, its session isn't.
  const punctuation = usePunctuation(tab === "punctuation", setError);
  // Stats owns the word list because the Words tab reads the same one:
  // one fetch, one copy, so the two screens can never disagree about it.
  const stats = useStats(setError);
  const words = useWords(setError, stats.refresh);

  function chooseProfile(next: Profile) {
    setProfile(next); // every request from here on carries this profile
    setActiveProfile(next);
    setTab("practice");
    setError(null);
    stats.reset();
    practice.reset();
    punctuation.reset();
    freeType.reset();
  }

  /** Back to the picker. Stats and session state are dropped on the way out, or
   *  you'd be looking at one profile's numbers while typing into another's. */
  function switchProfile() {
    setActiveProfile(null);
    setTab("practice");
    setError(null);
    stats.reset();
    practice.reset();
    punctuation.reset();
    freeType.reset();
  }

  async function openStats() {
    practice.stopClock(); // freeze the sentence timer while you're off reading stats
    setTab("stats");
    setError(null);
    await stats.open();
  }

  // Nothing to fetch yet: the road is drawn from constants. It still stops the
  // clock, for the same reason every other tab does.
  function openRoadmap() {
    practice.stopClock();
    setTab("roadmap");
    setError(null);
  }

  /** The plain list of what you're working on. Shares the stats endpoint rather
   *  than adding one of its own, and skips the sessions fetch that Stats needs:
   *  there's no session dropdown on this tab. */
  async function openWords() {
    practice.stopClock(); // same as Stats — reading your list isn't typing time
    setTab("words");
    setError(null);
    await words.open();
  }

  /** Open the tab without starting anything, same as Practice. Switching tabs
   *  mid-thought shouldn't begin a session you didn't ask for. */
  function openFreeType() {
    practice.stopClock(); // free typing isn't practice time, don't let it count
    setTab("free");
    setError(null);
  }

  function openPunctuation() {
    practice.stopClock(); // same as every other tab on the way out of Practice
    setTab("punctuation");
    setError(null);
  }

  // The list screens and the start screen sit at the top. Everything else stays
  // centered, so a sentence you're typing lands under your eyes. Loading holds
  // the start screen's position, since it's still the start screen on display.
  const cardClass =
    tab === "words"
      ? // Uncapped, unlike every other screen, so the board and the add-a-word
        // panel get the full window width. The top margin clears the tab bar,
        // which is absolute and so contributes no flow height of its own.
        "w-full self-start mt-16"
      : tab === "roadmap"
        ? // Wider than the other screens, but capped: the road is longer than
          // any window once the squares are car-sized, so it scrolls inside its
          // own band rather than pushing the page sideways. The top margin is in
          // vh rather than rem so it sits just below the middle of the window
          // whatever the window is, instead of at a fixed distance from the top.
          "mx-auto mt-[38vh] mb-0 w-full max-w-[1500px] self-start"
        : tab === "stats"
        ? // Stats reads like a page, not a prompt, so it starts top-left. Same
          // top margin as the other tabs, to clear the absolute tab bar.
          "mx-0 mt-16 mb-0 w-full max-w-[880px] self-start"
        : tab === "free"
          ? freeType.phase === "typing"
            ? // No width cap: the card takes its width from the board. Pinned to
              // the top rather than centred, because the board is taller than
              // the window now and centring it hangs the stats off the top,
              // under the tab bar.
              "mx-auto mt-16 mb-0 self-start"
            : "mx-auto mt-48 mb-0 w-full max-w-[880px] self-start"
          : tab === "punctuation"
            ? punctuation.phase === "typing"
              ? // Same width as the practice sentence, for the same reason.
                "m-auto w-full max-w-[1200px]"
              : // Start screen, spinner, and the submitting line are all two
                // short lines, so they sit where Practice's start screen sits.
                "mx-auto mt-48 mb-0 w-full max-w-[880px] self-start"
          : practice.phase === "idle" || practice.phase === "loading"
          ? // The start screen is two short lines; centering them leaves the
            // button floating in an empty page, so it sits high instead. The top
            // margin clears the tab bar and intro blurb, both absolute at top-7
            // and so contributing no flow height to push it down.
            "mx-auto mt-48 mb-0 w-full max-w-[880px] self-start"
          : practice.phase === "typing"
            ? // Centered, so the sentence you're typing lands under your eyes.
              // Auto margins rather than align-items, which clips the top of
              // anything taller than the viewport. Wider than every other screen
              // because of the size the sentence is set at: at the usual 880px an
              // ordinary sentence broke over four lines.
              "m-auto w-full max-w-[1200px]"
            : // The recap is a table and a couple of headings, so it keeps the
              // width the rest of the app reads at.
              "m-auto w-full max-w-[880px]";

  // Each mode says its own piece, and only while you're not typing: mid-sentence
  // it's one more thing on screen competing with the words. Off the typing
  // screen it's always there, so it can't go missing on the tab you came back to.
  const endTyping =
    tab === "practice" && practice.phase === "typing"
      ? practice.end
      : tab === "punctuation" && punctuation.phase === "typing"
        ? punctuation.end
        : tab === "free" && freeType.phase === "typing"
          ? freeType.reset
          : null;

  const intro =
    tab === "roadmap"
      ? "Each square is a section to finish. The car is how far down the road you've got."
      : null;

  if (profile === null) {
    return (
      <div className="m-auto w-full max-w-[880px]">
        {/* The one screen where the buttons are the whole page, so they get to
            be real boxes rather than the text links used everywhere else. A
            faint fill on hover rather than the usual fade, since fading a box
            this size takes the label with it. */}
        <div className="flex gap-6">
          <button
            onClick={() => chooseProfile("testing")}
            className="flex-1 cursor-pointer rounded-xl border border-white px-6 py-[90px] text-[3.6rem] text-white no-underline hover:bg-white/8"
          >
            Testing
          </button>
          <button
            onClick={() => chooseProfile("personal")}
            className="flex-1 cursor-pointer rounded-xl border border-white px-6 py-[90px] text-[3.6rem] text-white no-underline hover:bg-white/8"
          >
            Personal
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {intro && <p className={INTRO}>{intro}</p>}

      {endTyping && (
        <button className={END_BUTTON} onClick={endTyping}>
          End session
        </button>
      )}

      {/* Absolute, not fixed, so it scrolls away over a long stats table
          instead of floating on top of it. */}
      <nav className="absolute top-7 left-1/2 flex -translate-x-1/2 gap-6">
        <button
          className={tab === "practice" ? TAB_ON : TAB_OFF}
          onClick={() => setTab("practice")}
        >
          Practice
        </button>
        <button
          className={tab === "free" ? TAB_ON : TAB_OFF}
          onClick={openFreeType}
        >
          Free Type
        </button>
        <button
          className={tab === "punctuation" ? TAB_ON : TAB_OFF}
          onClick={openPunctuation}
        >
          Punctuation
        </button>
        <button
          className={tab === "roadmap" ? TAB_ON : TAB_OFF}
          onClick={openRoadmap}
        >
          Roadmap
        </button>
        <button
          className={tab === "stats" ? TAB_ON : TAB_OFF}
          onClick={openStats}
        >
          Stats
        </button>
        <button
          className={tab === "words" ? TAB_ON : TAB_OFF}
          onClick={openWords}
        >
          Words
        </button>
      </nav>

      {/* Always on screen, because a profile you can't see is a profile you can
          forget you're in. Click it to go back to the picker. */}
      {/* The profile name is a wire value ("testing"), capitalized for display
          only — changing the value would mean changing the header the backend
          keys off, for the sake of a capital letter. */}
      <button
        className="absolute top-7 right-10 cursor-pointer rounded-full border border-white px-5.5 py-2 text-[1.6rem] text-white no-underline capitalize hover:opacity-[0.55]"
        onClick={switchProfile}
      >
        {profile}
      </button>

      <div className={cardClass}>
        {tab === "practice" && <Practice state={practice} error={error} />}

        {tab === "punctuation" && (
          <Punctuation state={punctuation} error={error} />
        )}

        {tab === "roadmap" && <Roadmap />}

        {tab === "free" && <FreeType state={freeType} error={error} />}

        {tab === "stats" && <Stats state={stats} error={error} />}

        {tab === "words" && (
          <Words state={words} stats={stats.data} error={error} />
        )}
      </div>
    </>
  );
}
