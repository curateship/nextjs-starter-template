import * as React from "react"

/**
 * Where a network's keywords are drawn: the left column of a project, under
 * the picked network's Commenting row (Tyler, 5 Nov 2026, part 11 of
 * `workspace/tasks/Projects/commenting-dashboard.md`). The dashboard provides
 * the element; each network's Commenting header still owns the keywords,
 * their actions and their add form, and only the drawing moves. Until the
 * left column has mounted there is no element, and nothing is drawn.
 */
export const KeywordListSlotContext = React.createContext<{ element: HTMLElement | null } | null>(null)
