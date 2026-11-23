/**
 * The `/users` directory's three tabs (Most focused, Newest, Online now) and its search box's limit, shared by
 * the page, its address and the server. See `workspace/docs/users-directory.md`.
 */
export const USER_SORTS = ["focused", "newest", "online"] as const
export type UserSort = (typeof USER_SORTS)[number]

export const USER_SORT_LABELS: Record<UserSort, string> = {
  focused: "Most focused",
  newest: "Newest",
  online: "Online now",
}

/** Longer than any display name or handle, so a full one always fits. */
export const USER_SEARCH_MAX_LENGTH = 40
