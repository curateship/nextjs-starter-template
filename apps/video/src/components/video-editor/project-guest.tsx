import * as React from "react"
import { useMatch } from "@tanstack/react-router"

/**
 * Whether the editor is open for a guest sent from Project
 * (`workspace/docs/project-guests.md`), and who they are. Null on the admin
 * editor. The guest editor page provides it; the editor's pieces read it to
 * leave out what a guest can't use: AI, the media library and collections,
 * music, voices, stickers, share links, deleting and renaming.
 */
export type ProjectGuest = {
  /** Their name in Project, shown as "Sam via Project". */
  name: string
  projectId: string
}

const ProjectGuestContext = React.createContext<ProjectGuest | null>(null)

export const ProjectGuestProvider = ProjectGuestContext.Provider

export function useProjectGuest() {
  return React.useContext(ProjectGuestContext)
}

/** What a guest is told once their 12 hours are up or their sign-in is gone. */
export const GUEST_ENDED_MESSAGE = "Your time in this video has ended. Open the task in Project again."

/**
 * Whose browser storage the editor's remembered view and clipboard use: the
 * signed-in person's id, or for a guest one key per project, since a guest
 * has no account.
 */
export function useEditorPersonKey(): string {
  const guest = useProjectGuest()
  const signedIn = useMatch({ from: "/_authenticated", shouldThrow: false })
  if (guest) return `guest:${guest.projectId}`
  return signedIn?.loaderData?.user.id ?? ""
}
