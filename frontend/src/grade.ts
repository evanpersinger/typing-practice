/** Lowercase and strip surrounding punctuation so "Separate," == "separate".
 *  Free Type's board uses it; Practice is graded by the backend. */
export function normalize(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}
