import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Schemas, unwrap } from "./client";

export type Reminder = Schemas["ReminderOut"];
export type ReminderType = Reminder["reminder_type"];

export const REMINDER_TEXT: Record<ReminderType, { title: string; description: string; body: string }> = {
  mood_checkin: { title: "Mood check-in reminder", description: "A gentle nudge to log how you feel.", body: "How are you feeling today? Take 30 seconds to check in." },
  study: { title: "Study reminder", description: "A reminder to start a focus session.", body: "Ready for a focus session? Pick a task and start a Pomodoro." },
  wellness: { title: "Wellness reminder", description: "Time for a breathing exercise or meditation.", body: "Take a short break: try a breathing exercise." },
};

export const useReminders = (enabled = true) =>
  useQuery({ queryKey: ["reminders"], queryFn: () => unwrap(api.GET("/api/reminders")), enabled });

export function useSetReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, ...body }: Schemas["ReminderSet"] & { type: ReminderType }) =>
      unwrap(api.PUT("/api/reminders/{reminder_type}", { params: { path: { reminder_type: type } }, body })),
    onSuccess: (all) => qc.setQueryData(["reminders"], all),
  });
}
