/** Lowercase and strip surrounding punctuation so "Separate," == "separate".
 *  Free Type's board uses it; Practice is graded by the backend. */
export function normalize(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}

/** Whether you've typed the whole sentence: at least as many characters as it
 *  has, ending on its last one. Both halves matter. The length is what stops a
 *  period in the middle of a sentence ("Mrs.") ending it early, and the last
 *  character is what keeps one extra letter earlier on from ending it a
 *  character short. Case doesn't count, the same as the board's highlighting
 *  and the backend's grader. */
export function reachedEnd(typed: string, sentence: string): boolean {
  return (
    typed.length >= sentence.length &&
    typed.slice(-1).toLowerCase() === sentence.slice(-1).toLowerCase()
  );
}
