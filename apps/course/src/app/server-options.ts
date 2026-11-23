import { COURSES_ROW_KEY } from "@/lib/courses/courses-row"
import type { AppServerOptions } from "@/server/app-options"
import { readCoursesRow } from "@/server/courses/courses-row"
import { COPY_COURSES_CHOICE, copySiteCourses } from "@/server/courses/site-copy"

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
 * New server functions still go in `src/lib/api/`, never here: the guard test
 * only walks that folder, so an endpoint declared here would be an unguarded
 * door nobody is told about.
 */
export const appServerOptions: AppServerOptions = {
  pages: {
    /**
     * What fills a Courses row on the visited site's front page. Answering
     * null leaves the row off: no published course yet, or the Courses page
     * is closed to this visitor.
     */
    frontPageRowReaders: {
      [COURSES_ROW_KEY]: ({ settings, workspaceId }) =>
        readCoursesRow(workspaceId, settings),
    },
  },
  workspaces: {
    copyChoices: [{ key: COPY_COURSES_CHOICE, label: "Copy courses" }],
    onCopy: copySiteCourses,
  },
}
