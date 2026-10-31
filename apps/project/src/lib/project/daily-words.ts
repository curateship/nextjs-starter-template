import type { DayPart, HabitIcon } from "@/lib/project/daily-card"

/**
 * The sample routines a first habit list starts from. The card has no
 * built-in lines or night questions: only the site admin's own show (Tyler,
 * 30 Oct 2026: "Remove all of the premade morning and night lines").
 */
/** Each habit starts once and can be changed. */
export const READY_ROUTINES: Record<DayPart, { name: string; icon: HabitIcon; target: number }[]> = {
  morning: [
    { name: "Drink water", icon: "cup", target: 1 },
    { name: "Stretch", icon: "stretch", target: 1 },
    { name: "Plan the day", icon: "list", target: 1 },
  ],
  afternoon: [
    { name: "Walk", icon: "walk", target: 1 },
    { name: "Glasses of water", icon: "cup", target: 8 },
    { name: "Clear the inbox", icon: "inbox", target: 1 },
  ],
  night: [
    { name: "Tidy the desk", icon: "sparkle", target: 1 },
    { name: "Read", icon: "book", target: 1 },
    { name: "Screens off", icon: "moon", target: 1 },
  ],
}
