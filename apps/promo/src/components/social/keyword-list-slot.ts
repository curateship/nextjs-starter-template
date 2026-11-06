import * as React from "react"

/**
 * Where the keywords are drawn as a list instead of a dropdown: the left
 * column of a project, under the picked network's Commenting row (Tyler, 5 Nov 2026, part 11 of
 * `workspace/tasks/Projects/commenting-dashboard.md`). The dashboard provides
 * the element; each network's keyword header still owns the keywords, their
 * actions and their add box, and only the drawing moves.
 *
 * The context being there is what switches to the list, not the element, so
 * the server and the browser's first drawing agree: nothing in the header,
 * and the list once the left column has mounted.
 */
export const KeywordListSlotContext = React.createContext<{ element: HTMLElement | null } | null>(null)
