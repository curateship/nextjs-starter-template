import type { ShellSection } from "@/lib/custom-shell"

/**
 * Fitness in the left menu: Programs, where every program is made and opened,
 * and Exercises, the library filtered by routine type (Tyler, 18 Oct 2026).
 * The members' and admins' menus get it from a background job
 * (`src/server/fitness/navigation.ts`); a coach's menu starts as it (`roles`
 * in `src/app/options.ts`).
 */

export const FITNESS_NAV_SECTION_ID = "section-fitness"

export function fitnessNavSection(): ShellSection {
  return {
    id: FITNESS_NAV_SECTION_ID,
    title: "Training",
    entries: [
      { type: "item", id: "item-fitness-programs", label: "Programs", href: "/programs", icon: "dumbbell", visible: true },
      { type: "item", id: "item-fitness-exercises", label: "Exercises", href: "/exercises", icon: "list", visible: true },
    ],
  }
}
