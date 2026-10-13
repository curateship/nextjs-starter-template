import * as React from "react"

/**
 * Opens a teammate's page from their name, where a screen allows it. Only a
 * screen that isn't itself a window provides it (the project page and My
 * dashboard), since a window never opens on top of another: a chat inside a
 * task's window shows names as plain words.
 */
export const OpenPersonContext = React.createContext<((userId: string) => void) | null>(null)

export function useOpenPerson() {
  return React.useContext(OpenPersonContext)
}
