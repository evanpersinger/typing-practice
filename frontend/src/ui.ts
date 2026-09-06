// What more than one section needs. A constant earns a place here by being used
// from two section files, not by looking general: anything only one section
// reads stays in that section's own file, where you can see it next to the
// thing it styles.

// Behind anything you read or type, never behind chrome. A solid panel rather
// than a wash: #4a4f4c is the app's structural grey, and at full strength it
// gives the words a ground of their own instead of the wall photo's changing
// one. No border, the fill is the edge. Used by the practice prompt, the Free
// Type board, and the words table.
export const WORD_SURFACE = "rounded-xl bg-[#4a4f4c]";

// The one action on either start screen, practice and Free Type both. Filled
// rather than a bare outline, so it reads as something you press instead of a
// label in a box. The fill is the wall's own colour, not a white wash: white
// type needs a dark ground, and this one reads as a solid plate cut from the
// wall rather than a new colour in the app. Hover is an explicit lighter grey
// rather than the usual white overlay, since two bg utilities on one element
// resolve by stylesheet order.
export const START_BUTTON =
  "cursor-pointer rounded-[10px] border border-white bg-[#2a2e2c] px-20 py-9 " +
  "text-[3.2rem] text-white no-underline hover:bg-[#4a4f4c]";

// The three letter states, shared by the Free Type board and the practice
// prompt so a colour means the same thing in both. Named FREE_ because the
// board had them first; they aren't Free Type's alone.

// A letter you got wrong. The same red the error line uses.
export const FREE_MISS = "text-[#ff7a70]";

// A letter you haven't reached yet. White is what you've already typed, so the
// text fills in ahead of the caret as you go. Same grey as the input
// placeholder, for the same reason: it reads as text that isn't yours yet.
export const FREE_PENDING = "text-[#7d827e]";

// Zero-width, so the caret moving through a word doesn't shove the rest of it
// sideways: the 2px border is cancelled by the 1px margin on either side.
export const FREE_CARET =
  "inline-block h-[1.05em] w-0 -mx-px border-l-2 border-white align-[-0.15em]";

// Zero rather than a dash on an empty denominator: the stats tab always renders
// its real shape, so you can see what the numbers will look like before you have
// any. Nothing here divides by zero except a stats page you haven't earned yet.
export function pct(part: number, whole: number): string {
  if (whole === 0) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}
