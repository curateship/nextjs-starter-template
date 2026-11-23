import type { AppOptions } from "@/lib/app-options"
import { FITNESS_SETTINGS_TABS } from "@/lib/fitness/app-settings"
import { fitnessNavSection } from "@/lib/fitness/menu"
import {
  FITNESS_NOTICE_CATEGORIES,
  fitnessNoticeKind,
  fitnessNoticeLook,
  isFitnessNoticeKind,
} from "@/lib/fitness/notices"

/**
 * What this app changes about the shell.
 *
 * Open `src/lib/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * The type is written as an annotation rather than `satisfies` so that an empty
 * object still reads as the full shape. Both catch a misspelled option.
 */
type SettingsTabs = typeof import("@/components/fitness/settings/fitness-settings-tabs")

/**
 * A pointer to one of Fitness's Settings tabs, never the component: the tabs'
 * module builds server functions as it loads, and this file is read on the
 * server. Through `import.meta.glob`, as Pomoder does, so the background
 * worker's build never follows it into the shell's settings screens.
 */
function settingsTab(name: keyof SettingsTabs) {
  const tabs = import.meta.glob<SettingsTabs>("/src/components/fitness/settings/fitness-settings-tabs.tsx")
  return tabs["/src/components/fitness/settings/fitness-settings-tabs.tsx"]().then((module) => ({
    default: module[name],
  }))
}

export const appOptions: AppOptions = {
  /** The home-screen icon opens Programs. */
  homeScreen: { startPath: "/programs" },
  /**
   * A coach builds programs for their clients and reads their logs
   * (`src/server/fitness/coach.ts`). The site admin makes a coach on Admin,
   * Users. A coach trains too, and finds their clients on the Programs
   * dashboard.
   */
  roles: [
    {
      id: "coach",
      label: "Coach",
      landing: "/programs",
      features: ["aiUsage", "feedback", "changelog", "security", "emailChange"],
      menu: [fitnessNavSection()],
    },
  ],
  notifications: {
    categories: FITNESS_NOTICE_CATEGORIES,
    /** A notice's look, read from its own heading so the first paint is right. */
    describe: (notice) => {
      const kind = fitnessNoticeKind(notice)
      return kind ? fitnessNoticeLook(kind) : null
    },
    /** Where each notice opens, which only the server knows. */
    detailsFor: async (notices) => {
      const mine = notices.filter((notice) => fitnessNoticeKind(notice) !== null)
      if (mine.length === 0) return {}
      const { loadFitnessNoticeLinks } = await import("@/lib/api/fitness/coaching")
      const found = await loadFitnessNoticeLinks(mine.map((notice) => notice.id))
      return Object.fromEntries(
        Object.entries(found).map(([id, link]) => [
          id,
          { ...(isFitnessNoticeKind(link.kind) ? fitnessNoticeLook(link.kind) : {}), href: link.href },
        ])
      )
    },
  },
  /**
   * Fitness's own settings, under App settings in the Settings rail. Tyler,
   * 18 Oct 2026: "all these settings live in settings page in the app
   * settings reserved for the app." One answer for the whole app, saved as
   * it changes.
   */
  settings: {
    tabs: [
      { id: FITNESS_SETTINGS_TABS.units, label: "Units and plates", panel: () => settingsTab("UnitsSettingsTab") },
      { id: FITNESS_SETTINGS_TABS.workouts, label: "Workouts", panel: () => settingsTab("WorkoutsSettingsTab") },
      { id: FITNESS_SETTINGS_TABS.reminders, label: "Reminders", panel: () => settingsTab("RemindersSettingsTab") },
      { id: FITNESS_SETTINGS_TABS.calendar, label: "Calendar feed", panel: () => settingsTab("CalendarFeedSettingsTab") },
    ],
  },
}
