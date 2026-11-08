import { eq } from "drizzle-orm"

import {
  cleanWidgetLayout,
  DEFAULT_WIDGET_LAYOUT,
  widgetChoices,
  type WidgetLayout,
} from "@/lib/admin-dashboard/overview-widgets"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAdminWidgetLayouts } from "@/server/schema"

/**
 * Overview's widget layout, one per site (Tyler, 8 Nov 2026: picked "The
 * whole site"). Every admin sees the same, and a change by one shows for
 * all. Both ways go through `cleanWidgetLayout`, so an app widget that was
 * taken away reads back as an Empty spot.
 */

function knownWidgets() {
  return widgetChoices().map((widget) => widget.id)
}

export async function getWidgetLayout(workspaceId: string, database: CustomShellDb = db): Promise<WidgetLayout> {
  const [row] = await database
    .select({ layout: customShellAdminWidgetLayouts.layout })
    .from(customShellAdminWidgetLayouts)
    .where(eq(customShellAdminWidgetLayouts.workspaceId, workspaceId))
    .limit(1)
  return row ? cleanWidgetLayout(row.layout, knownWidgets()) : DEFAULT_WIDGET_LAYOUT
}

/** Saves the layout cleaned, and hands back what was stored. */
export async function saveWidgetLayout(
  workspaceId: string,
  layout: unknown,
  database: CustomShellDb = db
): Promise<WidgetLayout> {
  const clean = cleanWidgetLayout(layout, knownWidgets())
  const at = now()
  await database
    .insert(customShellAdminWidgetLayouts)
    .values({ workspaceId, layout: clean, updatedAt: at })
    .onConflictDoUpdate({
      target: customShellAdminWidgetLayouts.workspaceId,
      set: { layout: clean, updatedAt: at },
    })
  return clean
}
