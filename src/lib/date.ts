const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Asia/Seoul as YYYY-MM-DD. */
export function seoulToday(now: Date = new Date()): string {
  return seoulDate.format(now);
}
