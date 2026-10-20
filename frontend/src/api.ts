// Same-origin. The dev server proxies /api to the backend (vite.config.ts), so
// the port lives in one place instead of being baked into the app code.
export const API_BASE = "/api";

/** Which world you're in. `personal` is your real data; `testing` is a separate
 *  database you can throw junk at. The backend keys off the header below. */
export type Profile = "personal" | "testing";

// Deliberately not persisted. The app asks every time it loads, so you can't
// come back tomorrow and start feeding junk into your real numbers because a
// setting remembered something you forgot.
let profile: Profile = "personal";

export function setProfile(next: Profile): void {
  profile = next;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Profile": profile, ...extra };
}

export interface Drill {
  sentence: string;
  target_words: string[];
}

export interface DrillsResponse {
  words: string[];
  drills: Drill[];
}

/** A punctuation sentence. `feature` is the one mark it exercises, in the
 *  catalog's own words. Nothing on the frontend reads it yet. */
export interface PunctuationDrill {
  sentence: string;
  feature: string;
}

export interface PunctuationDrillResult {
  sentence: string;
  typed: string;
}

export interface WordResult {
  word: string;
  typed: string;
  correct: boolean;
}

export interface DrillResult {
  sentence: string;
  typed: string;
  duration_ms: number;
  words: WordResult[];
}

export interface WordStat {
  word: string;
  attempts: number;
  misses: number;
  streak: number;
  status: string;
  source: string;
  last_seen: string | null;
}

export interface TypingStats {
  drills: number;
  avg_wpm: number;
}

/** One row of the punctuation table: a mark and how you've missed it. `total`
 *  is the three kinds added up, worst first as the backend sends them. */
export interface PunctuationStat {
  mark: string;
  missing: number;
  extra: number;
  wrong: number;
  total: number;
}

export interface StatsResponse {
  words: WordStat[];
  typing: TypingStats;
  punctuation: PunctuationStat[];
}

export interface NewWord {
  word: string;
  reason: string;
}

export interface AnalysisResponse {
  new_words: NewWord[];
  // Speed for the session you just finished, from the same query that backs the
  // stats tab, so the two numbers can never disagree.
  typing: TypingStats;
}

export interface AddWordResponse {
  word: string;
  /** False when the word was already on your list. Not a failure. */
  added: boolean;
}

export interface SessionSummary {
  id: number;
  started_at: string;
}

export interface SessionDetail {
  id: number;
  started_at: string;
  words: WordResult[];
  new_words: NewWord[];
  typing: TypingStats;
}

/** The backend's `detail` (e.g. "ANTHROPIC_API_KEY is not set") beats a bare
 *  status code. Falls back to the code when the body isn't JSON. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(body?.detail ?? `${fallback} (${res.status})`);
}

export async function fetchDrills(): Promise<DrillsResponse> {
  const res = await fetch(`${API_BASE}/drills`, { headers: headers() });
  if (!res.ok) throw await failure(res, "Failed to load drills");
  return res.json();
}

/** Free Type's word pool. Plain strings, not drills: there's no sentence to
 *  grade against and no target words to pick out, just the word itself. */
export async function fetchFreeWords(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/free-words`, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to load words (${res.status})`);
  const data = await res.json();
  return data.words;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${API_BASE}/stats`, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
  return res.json();
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to load sessions (${res.status})`);
  const data = await res.json();
  return data.sessions;
}

export async function fetchSessionDetail(id: number): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to load that session (${res.status})`);
  return res.json();
}

export async function addWord(word: string): Promise<AddWordResponse> {
  const res = await fetch(`${API_BASE}/words`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ word }),
  });
  if (!res.ok) {
    // The backend says exactly what's wrong with the word ("One word only…").
    // That's worth showing; a bare status code isn't.
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Failed to add word (${res.status})`);
  }
  return res.json();
}

export async function submitResults(
  results: DrillResult[],
): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/results`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error(`Failed to submit results (${res.status})`);
  return res.json();
}

export async function fetchPunctuationDrills(): Promise<{
  drills: PunctuationDrill[];
}> {
  const res = await fetch(`${API_BASE}/punctuation-drills`, {
    headers: headers(),
  });
  if (!res.ok) throw await failure(res, "Failed to fetch punctuation drills");
  return res.json();
}

/** Only the sentence and what you typed. The backend grades this mode, unlike
 *  Practice, so there's one punctuation grader rather than two. */
export async function submitPunctuationResults(
  results: PunctuationDrillResult[],
): Promise<void> {
  const res = await fetch(`${API_BASE}/punctuation-results`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ results }),
  });
  if (!res.ok) {
    throw new Error(`Failed to submit punctuation results (${res.status})`);
  }
}
