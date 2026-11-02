/** Dates and durations, always shown in Amman time like the backend's daily figures. */
const TZ = "Asia/Amman";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-11-02" for a moment, in Amman time. */
export function localDate(value: string | Date): string {
  return dayKey.format(new Date(value));
}

export function todayLocal(): string {
  return localDate(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const weekdayShort = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });

/** "Today, 2:15 pm", "Yesterday, 10:00 am" or "24 Oct, 6:45 pm". */
export function whenLabel(value: string): string {
  const day = localDate(value);
  const today = todayLocal();
  const prefix = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : dayMonth.format(new Date(value));
  return `${prefix}, ${time.format(new Date(value))}`;
}

/** "Mon" for "2026-11-02". */
export function weekday(isoDate: string): string {
  return weekdayShort.format(new Date(`${isoDate}T12:00:00Z`));
}

/** "2 Nov" for "2026-11-02". */
export function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function todayLong(): string {
  return longDate.format(new Date());
}

/** 260 -> "4h 20m", 45 -> "45m". */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
