import * as React from "react"
import { Link, useSearch } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * The project a video is being edited for, which the editor's header goes back
 * to (`workspace/docs/content-app.md`, "The video editor"; Tyler, 26 Nov 2026:
 * "Option 1: whole screen"). Null for a video project made outside a project.
 */
const EditorBack = React.createContext<{ id: string; name: string } | null>(null)

export const EditorBackProvider = EditorBack.Provider

export function useEditorBack() {
  return React.useContext(EditorBack)
}

/**
 * The button the editor's header starts with: the arrow and the project's
 * name, going back to the project's Content where the video was opened from:
 * Drafts when the address says so (`?from=drafts`), All content otherwise, as
 * from a draft in All content or Add → Create video (Tyler, 27 Nov 2026:
 * "clicking back to content archive shows a list ... but it was a grid before
 * that?").
 */
export function EditorBackButton({ project }: { project: { id: string; name: string } }) {
  const { from } = useSearch({ strict: false }) as { from?: string }
  return (
    <Button asChild variant="ghost" className="max-w-56 shrink-0 gap-1.5 px-2 font-normal">
      <Link
        to="/admin/projects/$projectId"
        params={{ projectId: project.id }}
        search={from === "drafts" ? { archive: "1", stage: "draft" } : {}}
        aria-label={`Back to ${project.name}`}
      >
        <ArrowLeftIcon />
        <span className="min-w-0 truncate">{project.name}</span>
      </Link>
    </Button>
  )
}
