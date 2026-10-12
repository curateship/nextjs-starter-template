import { PlusIcon, SearchIcon } from "lucide-react"

import type { AppOptions } from "@/lib/app-options"
import {
  PROJECT_NOTICE_CATEGORIES,
  isProjectNoticeKind,
  noticeKindFromWords,
  noticeLook,
} from "@/lib/project/notices"

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
export const appOptions: AppOptions = {
  header: {
    rightActions: [
      {
        /**
         * One search over every project the person can see, so a task in a
         * forgotten project is one step away. A match opens on its project page.
         */
        id: "task-search",
        label: "Search tasks",
        icon: SearchIcon,
        foldsOnPhone: true,
        component: () => import("@/components/project/task-search-header"),
      },
      {
        /**
         * New task from any page, so a task is written down the moment it is
         * thought of. It opens the project page's window with a Project picker.
         */
        id: "new-task",
        label: "New task",
        icon: PlusIcon,
        foldsOnPhone: true,
        component: () => import("@/components/project/new-task-header"),
      },
    ],
  },
  notifications: {
    categories: PROJECT_NOTICE_CATEGORIES,
    /** A task notice's look, read from its own heading so the first paint is right. */
    describe: (notice) => {
      const kind = noticeKindFromWords(notice)
      return kind ? noticeLook(kind) : null
    },
    /** Where each task notice opens, which only the server knows. */
    detailsFor: async (notices) => {
      const mine = notices.filter((notice) => notice.type === "app_activity")
      if (mine.length === 0) return {}
      const { loadProjectNoticeDetails } = await import("@/lib/api/project/tasks")
      const found = await loadProjectNoticeDetails(mine.map((notice) => notice.id))
      return Object.fromEntries(
        Object.entries(found).map(([id, detail]) => [
          id,
          {
            ...(isProjectNoticeKind(detail.kind) ? noticeLook(detail.kind) : {}),
            href: detail.href,
          },
        ])
      )
    },
  },
}
