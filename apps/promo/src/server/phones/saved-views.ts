import { and, eq, inArray } from "drizzle-orm"

import { keptRackFilters, NO_GROUP, RACK_VIEW_KIND } from "@/lib/phones/rack-search"
import type { SavedViewScreen } from "@/server/app-options"
import { promoProfileFolders, promoProfileLabels } from "@/server/browser/schema"
import { promoProjects } from "@/server/social/schema"

import { promoRacks } from "./schema"

/**
 * Views on a rack's phones (Racks dashboard, part 96; Tyler, 5 Nov 2026:
 * "Use the ui standard filter and save filter feature with saved filter
 * rainbow button"). Only the rack's owner keeps them, and a view saves the
 * names of the folder, label and project it points at, so one deleted since
 * says so instead of failing.
 */
export const rackSavedViewScreens: Record<string, SavedViewScreen> = {
  [RACK_VIEW_KIND]: {
    authorize: async ({ userId, recordId, database }) => {
      const [rack] = await database
        .select({ id: promoRacks.id })
        .from(promoRacks)
        .where(and(eq(promoRacks.id, recordId), eq(promoRacks.userId, userId)))
        .limit(1)
      if (!rack) throw new Error("That rack is not there any more.")
    },
    keep: ({ filters }) => keptRackFilters(filters),
    namesOf: async ({ userId, filters, database }) => {
      const id = (value: unknown) => (typeof value === "string" && value !== NO_GROUP ? [value] : [])
      const folders = id(filters.folder)
      const labels = id(filters.label)
      const projects = id(filters.project)
      const [folderRows, labelRows, projectRows] = await Promise.all([
        folders.length
          ? database
              .select({ id: promoProfileFolders.id, name: promoProfileFolders.name })
              .from(promoProfileFolders)
              .where(and(eq(promoProfileFolders.userId, userId), inArray(promoProfileFolders.id, folders)))
          : [],
        labels.length
          ? database
              .select({ id: promoProfileLabels.id, name: promoProfileLabels.name })
              .from(promoProfileLabels)
              .where(and(eq(promoProfileLabels.userId, userId), inArray(promoProfileLabels.id, labels)))
          : [],
        projects.length
          ? database
              .select({ id: promoProjects.id, name: promoProjects.name })
              .from(promoProjects)
              .where(and(eq(promoProjects.userId, userId), inArray(promoProjects.id, projects)))
          : [],
      ])
      return Object.fromEntries([...folderRows, ...labelRows, ...projectRows].map((row) => [row.id, row.name]))
    },
  },
}
