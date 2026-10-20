import type { AppServerOptions } from "@/server/app-options"
import { runCheckinJobs } from "@/server/project/checkin-jobs"
import { addProjectNavigation } from "@/server/project/navigation"
import { runPlanningJobs } from "@/server/project/planning-jobs"
import { runReminderJobs } from "@/server/project/reminder-jobs"
import { projectSavedViewScreens } from "@/server/project/saved-views"

/**
 * What this app changes about the shell, on the server side.
 *
 * The companion to `options.ts`. That file is seen by the browser, so it holds
 * the drawing and the wording; this one never is, so it holds the work — the
 * parts that reach the database or call something outside.
 *
 * Open `src/server/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * New server functions still go in `src/lib/api/`, never here: the guard test
 * only walks that folder, so an endpoint declared here would be an unguarded
 * door nobody is told about.
 */
export const appServerOptions: AppServerOptions = {
  background: {
    workers: [
      // Adds My dashboard, Projects and Team to each left menu once.
      { name: "project-navigation", tick: () => addProjectNavigation() },
      // Sends each person's check-in reminder and saves each finished day.
      { name: "project-checkins", tick: () => runCheckinJobs() },
      // Due-date reminders and the owner's morning notice.
      { name: "project-reminders", tick: () => runReminderJobs() },
      // Each day's copy of a repeating task, and bins emptied after 30 days.
      { name: "project-planning", tick: () => runPlanningJobs() },
    ],
  },
  // Views on a project's Board and List, and on My tasks.
  savedViews: { screens: projectSavedViewScreens },
}
