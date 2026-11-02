import { AlertCircle, Frown, Meh, Smile, type LucideIcon, Zap } from "lucide-react";

/** The five moods, same scale as the backend and GP1 section 4.1.4.1. */
export type MoodValue = 1 | 2 | 3 | 4 | 5;

export const MOODS: { value: MoodValue; label: string; icon: LucideIcon; color: string }[] = [
  { value: 5, label: "Happy", icon: Smile, color: "#52b788" },
  { value: 4, label: "Neutral", icon: Meh, color: "#2e75b6" },
  { value: 3, label: "Sad", icon: Frown, color: "#7aa7d6" },
  { value: 2, label: "Stressed", icon: Zap, color: "#f2b631" },
  { value: 1, label: "Anxious", icon: AlertCircle, color: "#dc2626" },
];

export function moodInfo(value: number) {
  return MOODS.find((m) => m.value === Math.round(value)) ?? MOODS[1];
}
