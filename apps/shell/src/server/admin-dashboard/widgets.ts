import { and, eq } from "drizzle-orm"

import {
  cleanWidgetLayout,
  defaultWidgetLayout,
  widgetChoices,
  type WidgetBoard,
  type WidgetLayout,
} from "@/lib/admin-dashboard/overview-widgets"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAdminWidgetLayouts } from "@/server/schema"

/**
 * An Overview's widget layout, one per site and dashboard (Tyler, 8 Nov
 * 2026: picked "The whole site"; the CRM's Overview the same day). Every
 * admin sees the same, and a change by one shows for all. Both ways go
 * through `cleanWidgetLayout`, so an app widget that was taken away reads
 * back as an Empty spot.
 */

function clean(board: WidgetBoard, layout: unknown) {
  const known = widgetChoices(board).map((widget) => widget.id)
  return cleanWidgetLayout(layout, known, defaultWidgetLayout(board))
}

export async function getWidgetLayout(
  workspaceId: string,
  board: WidgetBoard,
  database: CustomShellDb = db
): Promise<WidgetLayout> {
  const [row] = await database
    .select({ layout: customShellAdminWidgetLayouts.layout })
    .from(customShellAdminWidgetLayouts)
    .where(and(eq(customShellAdminWidgetLayouts.workspaceId, workspaceId), eq(customShellAdminWidgetLayouts.board, board)))
    .limit(1)
  return row ? clean(board, row.layout) : defaultWidgetLayout(board)
}

/** Saves the layout cleaned, and hands back what was stored. */
export async function saveWidgetLayout(
  workspaceId: string,
  board: WidgetBoard,
  layout: unknown,
  database: CustomShellDb = db
): Promise<WidgetLayout> {
  const stored = clean(board, layout)
  const at = now()
  await database
    .insert(customShellAdminWidgetLayouts)
    .values({ workspaceId, board, layout: stored, updatedAt: at })
    .onConflictDoUpdate({
      target: [customShellAdminWidgetLayouts.workspaceId, customShellAdminWidgetLayouts.board],
      set: { layout: stored, updatedAt: at },
    })
  return stored
}
