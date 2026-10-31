/** Today as a local YYYY-MM-DD, the same shape the backend's /progress gives for a day. */
export function localDay(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The day before a YYYY-MM-DD. Worked out on the calendar at noon, so a daylight
 *  saving change can't skip or repeat a day. */
function dayBefore(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year, month - 1, date - 1, 12));
}

/** How many days in a row you've practiced, counting back from today. A day not
 *  practiced yet doesn't break the streak: if the last day was yesterday it still
 *  counts, until today ends without a session. */
export function dayStreak(practicedDays: string[], today: string): number {
  const days = new Set(practicedDays);
  let day = days.has(today) ? today : dayBefore(today);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = dayBefore(day);
  }
  return streak;
}
