import type { ComponentType } from "react"

/**
 * One extra tab on the Settings screen, added by the app.
 *
 * Settings is where somebody goes to change how the app behaves, and an app
 * with machinery of its own — a worker to pause, a feed to reconnect — has the
 * same question and the same right answer: on the Settings screen, in the rail
 * with everything else, not on a page of its own that has to be found.
 *
 * `panel` is **a pointer to another file, never the component itself**:
 * `panel: () => import("./workers-settings")`. The reason is the one written on
 * `fields` in `node-descriptor.ts` — a panel that loads something to show
 * imports `@/lib/api/*`, which builds a server function the moment it loads,
 * and this type is reachable from the server. A function returning an import is
 * not followed until a browser draws the tab, so there is nothing to remember:
 * the only thing this type accepts is already the safe one.
 */
export type AppSettingsTab = {
  /**
   * The last part of the address — `/admin/settings/<id>` — and the tab's own
   * name. An id the shell already uses is refused out loud.
   */
  id: string
  label: string
  panel: () => Promise<{ default: ComponentType }>
}

/** Identity helper so a tab literal stays fully typed at the definition. */
export function defineSettingsTab(tab: AppSettingsTab): AppSettingsTab {
  return tab
}
