import type { ShellIcon } from "@/lib/custom-shell"
import type { DayPart } from "@/lib/project/daily-card"

/**
 * The sample routines a first habit list starts from. The card has no
 * built-in lines or night questions: only the site admin's own show (Tyler,
 * 30 Oct 2026: "Remove all of the premade morning and night lines").
 */
/** Each habit starts once and can be changed. */
export const READY_ROUTINES: Record<DayPart, { name: string; icon: ShellIcon; target: number }[]> = {
  morning: [
    { name: "Drink water", icon: "cup-soda", target: 1 },
    { name: "Stretch", icon: "person-standing", target: 1 },
    { name: "Plan the day", icon: "list-checks", target: 1 },
  ],
  afternoon: [
    { name: "Walk", icon: "footprints", target: 1 },
    { name: "Glasses of water", icon: "cup-soda", target: 8 },
    { name: "Clear the inbox", icon: "inbox", target: 1 },
  ],
  night: [
    { name: "Tidy the desk", icon: "sparkles", target: 1 },
    { name: "Read", icon: "book-open", target: 1 },
    { name: "Screens off", icon: "moon", target: 1 },
  ],
}
