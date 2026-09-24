/**
 * When scheduled runs happen. Plain code with no server or browser dependencies, shared by the app,
 * the worker and the tests. Times follow the local clock of the machine running the worker,
 * so "every day at 09:00" stays at 09:00 across daylight saving changes.
 */

export const REPEATS = {
  once: "Once",
  daily: "Every day",
  weekdays: "Every weekday (Monday to Friday)",
  weekly: "Every week",
} as const;
export type Repeat = keyof typeof REPEATS;

export function isRepeat(value: string): value is Repeat {
  return Object.hasOwn(REPEATS, value);
}

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The first time on or after `start` that follows the repeat pattern and is later than `after`.
 * Returns null for a one-time schedule whose time has passed. Missed times are skipped, not caught up.
 */
export function nextRunAfter(start: Date, repeat: Repeat, after: Date): Date | null {
  if (repeat === "once") return start > after ? start : null;

  const stepDays = repeat === "weekly" ? 7 : 1;
  let candidate = new Date(start);
  if (repeat === "weekdays") while (isWeekend(candidate)) candidate = addDays(candidate, 1);

  // Jump close to `after` first, so a schedule started long ago does not loop day by day.
  const behindDays = Math.floor((after.getTime() - candidate.getTime()) / 86_400_000);
  if (behindDays > stepDays) candidate = addDays(candidate, Math.floor((behindDays - 1) / stepDays) * stepDays);

  while (candidate <= after || (repeat === "weekdays" && isWeekend(candidate))) candidate = addDays(candidate, stepDays);
  return candidate;
}

const time = (date: Date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "long" });
export const formatWhen = (date: Date) => date.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** For example "Every weekday at 09:00" or "Once, on Thu 25 Sept, 09:00". */
export function describeSchedule(repeat: Repeat, start: Date): string {
  switch (repeat) {
    case "once":
      return `Once, on ${formatWhen(start)}`;
    case "daily":
      return `Every day at ${time(start)}`;
    case "weekdays":
      return `Every weekday at ${time(start)}`;
    case "weekly":
      return `Every ${day(start)} at ${time(start)}`;
  }
}
