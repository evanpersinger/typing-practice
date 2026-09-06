// The road. Stops sit on it with one blank square between each pair, so they
// read as places along a road rather than a progress bar cut into parts. Stop 0
// is the start square, marked S, and the numbered sections run on from there.
// Both numbers are placeholders: what a section actually is, and where the car
// has really got to, are the next thing to work out. Nothing here is stored or
// fetched yet, so the car parks on S every time, and this section has no state
// of its own: it takes nothing and holds nothing.
const ROADMAP_SECTIONS = 6;
const ROADMAP_POSITION = 0;

// Every cell is the same size whether it holds a section or is blank road, so
// the squares stay evenly spaced without a gap doing the work: the blank cell
// is the gap. A square is sized to hold the car outright rather than to fit the
// number in it, which is why it's this much bigger than the type on it.
const ROAD_SQUARE =
  "relative flex size-[224px] shrink-0 items-start justify-center pt-6 " +
  "text-[2.6rem] font-semibold";

// One colour per stop, cool at the start and warm at the finish. Deliberately
// not a theme: what a section actually is hasn't been settled, and naming the
// colours would decide that by the back door. For now they say how far along
// the road a square sits and nothing else, so any one of them can be swapped
// later without the rest meaning something different.
//
// One entry per stop, so this has to stay ROADMAP_SECTIONS + 1 long.
//
// Set as a style rather than a utility class: a colour picked out of an array
// can't be written as a literal, and Tailwind only generates rules for literals
// it can find in the source.
const ROAD_COLORS = [
  "#7d827e", // S. The app's own grey, outside the ramp: a start isn't progress.
  "#5b8fc7",
  "#4da39a",
  "#6fae5e",
  "#c2a878",
  "#d08b4a",
  "#c85f4e",
];

// A square you haven't driven over yet shows its colour at this alpha over the
// road, so the ramp is legible the whole way along but only the road behind the
// car is at full strength. Hex rather than a separate list of rgba strings, so
// there's one place a colour is written down.
const ROAD_DIM = "59"; // 35%

// The square between two stops. Drawn rather than left as bare road, so it
// reads as a square you drive over on the way rather than a gap between two.
// Pitched between the road and a stop: visible as a square, never mistaken for
// one you have to finish.
const ROAD_BLANK = `${ROAD_SQUARE} bg-[#3a3f3c]`;

/**
 * You, on the road. An E36 M3 in profile: long bonnet, short deck, and the
 * greenhouse kinked forward at the base of the rear pillar.
 *
 * Drawn rather than fetched, so it costs nothing and takes the page's colours.
 * At this size the shape and the M stripe are the whole of it; anything finer
 * than a door handle disappears, so none of it is here.
 */
function RoadmapCar() {
  return (
    <svg viewBox="0 0 104 42" className="w-[148px]" aria-hidden="true">
      {/* Alpine white, one of the colours this car actually came in. */}
      <path
        d="M5 31 V24 L16 21 L31 11 H55 L70 20 L93 21 L99 25 V31 Z"
        fill="#eef0ed"
      />
      {/* Glass. The gap between the two panes is the B-pillar, left as body
          colour rather than drawn as its own shape. */}
      <path d="M22 21 L33 13 H41 V21 Z" fill="#262b28" />
      <path d="M45 13 H56 L67 20.5 H45 Z" fill="#262b28" />
      {/* The M stripe, the one detail at this size that says which BMW it is. */}
      <rect x="43" y="25.2" width="5" height="2.4" fill="#0c60b0" />
      <rect x="48" y="25.2" width="5" height="2.4" fill="#243a78" />
      <rect x="53" y="25.2" width="5" height="2.4" fill="#d0392f" />
      <rect x="94.5" y="22.5" width="4" height="2.4" rx="1" fill="#f2e6b4" />
      <rect x="5.5" y="24.5" width="4" height="2.4" rx="1" fill="#d0392f" />
      {/* Drawn last, so they sit over the body the way an unfilled arch reads. */}
      <circle cx="25" cy="31" r="8" fill="#1a1d1b" />
      <circle cx="25" cy="31" r="4" fill="#b9bcb8" />
      <circle cx="79" cy="31" r="8" fill="#1a1d1b" />
      <circle cx="79" cy="31" r="4" fill="#b9bcb8" />
    </svg>
  );
}

/**
 * The whole Roadmap screen. One cell per square, blanks included, so the stops
 * line up on a fixed pitch and the car sits in the same column as the square
 * it's parked on without being positioned by hand.
 *
 * The band holds still and the cells scroll inside it, because the road is
 * longer than any window once the squares are car-sized and the page shouldn't
 * be dragged sideways with it.
 */
export function Roadmap() {
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl bg-[#2a2e2c]">
      <div className="flex w-max items-center px-14 py-14">
        {Array.from({ length: (ROADMAP_SECTIONS + 1) * 2 - 1 }, (_, cell) => {
          // Even cells are stops, odd ones are the blank road between them.
          const stop = cell % 2 === 0 ? cell / 2 : null;
          if (stop === null) {
            return <div key={cell} className={ROAD_BLANK} />;
          }
          // Everything up to and including the square the car is on counts
          // as driven, so the road fills in behind it.
          const reached = stop <= ROADMAP_POSITION;
          return (
            <div
              key={cell}
              className={`${ROAD_SQUARE} ${
                reached ? "text-[#1e2220]" : "text-[#7d827e]"
              } ${stop === ROADMAP_POSITION ? "border-2 border-white" : ""}`}
              style={{
                backgroundColor: reached
                  ? ROAD_COLORS[stop]
                  : `${ROAD_COLORS[stop]}${ROAD_DIM}`,
              }}
            >
              {stop === 0 ? "S" : stop}
              {/* Centred on the square rather than parked above it: the
                  square is the stop you're on, so that's what it sits on. */}
              {stop === ROADMAP_POSITION && (
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <RoadmapCar />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
