import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  getDeleteProjectErrorMessage,
  getProjectErrorMessage,
  makeProject,
  removeProject,
} from "@/lib/api/social/projects"
import { NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { showErrorToast } from "@/lib/toast/error-toast"

export type ProjectDialog = null | { kind: "delete"; project: { id: string; name: string } }

/**
 * The window a project's ⋮ opens: deleting the project, which the server
 * refuses while it still holds accounts or keywords. New project is a
 * popover (`NewProjectPopover`).
 */
export function ProjectDialogs({
  dialog,
  onClose,
}: {
  dialog: ProjectDialog
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = React.useState(false)

  return (
    <>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={dialog?.kind === "delete" ? `Delete ${dialog.project.name}?` : "Delete project?"}
        description="Only an empty project can be deleted. Take its accounts out and remove its keywords first. Nothing else is deleted with it."
        confirmLabel="Delete project"
        loading={deleting}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return
          setDeleting(true)
          try {
            await removeProject(dialog.project.id)
            onClose()
            await navigate({ to: "/admin/projects" })
          } catch (error) {
            showErrorToast(getDeleteProjectErrorMessage(error))
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}

/**
 * New project, a popover under the button (Tyler, 27 Nov 2026: "Create new
 * project should open up a popover and it unselect all the networks as
 * default"): a name and the networks it is promoted on, none ticked to begin
 * with. A project with none shows "Add a network" on Promote. Its
 * description, accounts and keywords go on its page once it is made. Mounted
 * only while open, so each opening starts blank.
 */
export function NewProjectPopover({
  onCreated,
  open: openGiven,
  onOpenChange,
  anchorOnly = false,
  children,
}: {
  onCreated: (projectId: string) => Promise<void>
  /** Opened from outside, as from the project's ⋮; left out, its own button opens it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** `children` only places it, as the ⋮ does, and opens nothing itself. */
  anchorOnly?: boolean
  /** The button that opens it, or with `anchorOnly` what it sits under. */
  children: React.ReactNode
}) {
  const [openHere, setOpenHere] = React.useState(false)
  const open = openGiven ?? openHere
  const setOpen = (next: boolean) => {
    setOpenHere(next)
    onOpenChange?.(next)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchorOnly ? (
        // A box of its own to sit under, since a menu's button may draw no element it can measure.
        <PopoverAnchor className="inline-flex">{children}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent side="bottom" align="end" className="w-72 p-3">
        {open ? (
          <NewProjectForm
            onCreated={async (id) => {
              setOpen(false)
              await onCreated(id)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function NewProjectForm({ onCreated }: { onCreated: (projectId: string) => Promise<void> }) {
  const [name, setName] = React.useState("")
  const [networks, setNetworks] = React.useState<Network[]>([])
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the project a name first.")
      return
    }
    setSaving(true)
    try {
      const { id } = await makeProject(name.trim(), networks)
      await onCreated(id)
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void create()
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="new-project-name">Name</Label>
        <Input
          id="new-project-name"
          value={name}
          maxLength={120}
          placeholder="My product"
          autoFocus
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Networks</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {NETWORKS.map((network) => (
            <div key={network} className="flex items-center gap-2">
              <Checkbox
                id={`new-project-network-${network}`}
                checked={networks.includes(network)}
                onCheckedChange={(checked) =>
                  setNetworks((current) =>
                    checked === true
                      ? NETWORKS.filter((item) => item === network || current.includes(item))
                      : current.filter((item) => item !== network)
                  )
                }
              />
              <Label htmlFor={`new-project-network-${network}`} className="font-normal">
                {NETWORK_NAMES[network]}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={saving}>
        {saving ? <Loader2Icon className="animate-spin" /> : null}
        Create project
      </Button>
    </form>
  )
}
