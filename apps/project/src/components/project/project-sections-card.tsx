import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  makeSection,
  removeSection,
  saveSectionName,
  type Section,
} from "@/lib/api/project/sorting"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A project's sections, in Project settings: its own headings such as
 * "Design" and "Build", which the List tab groups rows under. Renaming saves
 * when the field is left; deleting moves the section's tasks to "No section".
 */
export function ProjectSectionsCard({
  projectId,
  sections,
  readOnly,
}: {
  projectId: string
  sections: Section[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function add() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Type the section's name first.")
      return
    }
    const ok = await run(() => makeSection(projectId, next), "Section added.")
    if (!ok) return
    setName("")
    await router.invalidate()
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Sections</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {sections.length
            ? "The List tab groups tasks under these. A task picks its section in the task itself."
            : "No sections yet. Add headings such as Design and Build, and the List tab groups tasks under them."}
        </p>
        {sections.length ? (
          <ul className="grid gap-2">
            {sections.map((section) => (
              <SectionRow key={section.id} section={section} readOnly={readOnly} />
            ))}
          </ul>
        ) : null}
        {readOnly ? null : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <Input
              aria-label="New section"
              placeholder="Add a section"
              value={name}
              maxLength={LIMITS.sectionName}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setName(event.target.value)
                setInvalid(false)
              }}
            />
            <Button type="submit" variant="outline" disabled={busy}>
              <PlusIcon className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function SectionRow({ section, readOnly }: { section: Section; readOnly: boolean }) {
  const router = useRouter()
  const [name, setName] = useSyncedDraft(section.name)
  const [confirming, setConfirming] = React.useState(false)
  // A refused or empty name stays in the box, marked, until it's fixed.
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function rename() {
    const next = name.trim()
    if (next === section.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A section needs a name.")
      return
    }
    if (await run(() => saveSectionName(section.id, next))) await router.invalidate()
    else setInvalid(true)
  }

  return (
    <li className="flex items-center gap-2">
      <Input
        aria-label={`Section name: ${section.name}`}
        value={name}
        maxLength={LIMITS.sectionName}
        disabled={readOnly}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setName(event.target.value)
          setInvalid(false)
        }}
        onBlur={() => void rename()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete the section "${section.name}"`}
          onClick={() => setConfirming(true)}
        >
          <Trash2Icon className="size-4" />
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${section.name}"?`}
        description="Its tasks stay in the project and move to No section."
        confirmLabel="Delete section"
        destructive
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => removeSection(section.id), "Section deleted.")
          if (!ok) return
          setConfirming(false)
          await router.invalidate()
        }}
      />
    </li>
  )
}
