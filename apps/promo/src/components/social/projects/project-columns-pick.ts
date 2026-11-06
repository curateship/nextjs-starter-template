import * as React from "react"

/**
 * What the left column has picked, from the project's dashboard: `key` names
 * it (a network and its row, or the Archive) and `label` is the middle
 * column's name on a phone. Each new key shows the middle column there, so a
 * row picked in the left column shows its list at once.
 */
export const ProjectColumnsPick = React.createContext<{ key: string; label: string }>({ key: "", label: "List" })
