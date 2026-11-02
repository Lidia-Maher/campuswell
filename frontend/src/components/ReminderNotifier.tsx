import { useEffect } from "react";

import { REMINDER_TEXT, useReminders } from "../api/reminders";

const TZ = "Asia/Amman";
const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/**
 * FR-10: shows a browser notification at each enabled reminder time (Amman time) while
 * CampusWell is open in a tab. Each reminder fires at most once per day.
 */
export function ReminderNotifier() {
  const reminders = useReminders();

  useEffect(() => {
    if (!("Notification" in window)) return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      const time = hhmm.format(now);
      for (const r of reminders.data ?? []) {
        if (!r.is_enabled || r.remind_at.slice(0, 5) !== time) continue;
        const key = `campuswell.reminded.${r.reminder_type}.${day.format(now)}`;
        try {
          if (localStorage.getItem(key)) continue;
          localStorage.setItem(key, "1");
        } catch {
          // storage unavailable: may notify twice in one minute, which is harmless
        }
        new Notification("CampusWell", { body: REMINDER_TEXT[r.reminder_type].body, icon: "/favicon.svg" });
      }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [reminders.data]);

  return null;
}
