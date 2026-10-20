/**
 * The other apps a task can point at, and what each one's button says. One
 * record per task (Tyler, 19 Oct 2026). How the handoff works is in
 * `workspace/docs/connected-apps.md`.
 */

export const LINKED_APPS = ["video", "promo"] as const
export type LinkedApp = (typeof LINKED_APPS)[number]

export const LINKED_APP_INFO: Record<LinkedApp, { name: string; record: string; button: string }> = {
  video: { name: "Video", record: "video project", button: "Edit video" },
  promo: { name: "Promo", record: "Promo project", button: "Open in Promo" },
}

export function isLinkedApp(value: unknown): value is LinkedApp {
  return typeof value === "string" && (LINKED_APPS as readonly string[]).includes(value)
}

/** The longest address a task keeps. */
export const LINKED_ADDRESS_MAX = 2000
