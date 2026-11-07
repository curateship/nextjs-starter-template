import * as React from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CRM_APP_BLOCKS, CrmBlocksProvider, type CrmBlocks } from "@/components/crm/crm-blocks"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  addCrmAddress,
  getCrmPageErrorMessage,
  lockCrmPage,
  removeCrmAddress,
  renameCrmAddress,
  saveCrmPage,
  setCrmPageCoverPhoto,
  setCrmUnansweredDays,
  type CrmBlockFigures,
} from "@/lib/api/crm/page"
import type { StoredPage } from "@/lib/notes/page-body"
import { dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The CRM dashboard's left panel (the Admin 3 panel design, 7 Nov 2026;
 * Tyler: "Left panel list blocks like emails, I want to add new emails to the
 * CRM so we'd need to add a + in the top header").
 *
 * - **Header:** the collapse button, "CRM" with its open conversations, the
 *   **+** that adds an address mail arrives at, and the ⋮ (CRM settings: the
 *   cover photo, and Lock the notes).
 * - **Page:** one per site, written on like any page in the design, with the
 *   "/" blocks: the basic ones, and the CRM's Emails, Follow up today and
 *   Stages (`crm-blocks.tsx`). A new site starts with Emails and Follow up
 *   today.
 */
export function CrmPagePanel({
  page,
  figures,
  blocks,
  onPageChange,
  onFiguresChanged,
}: {
  /** Null while the page is first read. */
  page: StoredPage | null
  figures: CrmBlockFigures | null
  blocks: Omit<CrmBlocks, "figures" | "onRenameAddress" | "onRemoveAddress">
  onPageChange: (page: StoredPage) => void
  /** Reads the figures again, and the inbox with them, after an address changed. */
  onFiguresChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [renaming, setRenaming] = React.useState<{ id: string; label: string } | null>(null)
  const [removing, setRemoving] = React.useState<{ id: string; address: string } | null>(null)

  const setLocked = async (locked: boolean) => {
    if (!page) return
    setBusy(true)
    try {
      await lockCrmPage(locked)
      onPageChange({ ...page, locked })
    } catch (error) {
      showErrorToast(getCrmPageErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const setCover = async (coverUrl: string | null) => {
    if (!page) return
    setBusy(true)
    try {
      await setCrmPageCoverPhoto(coverUrl)
      onPageChange({ ...page, coverUrl })
    } catch (error) {
      showErrorToast(getCrmPageErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const provided: CrmBlocks = {
    ...blocks,
    figures,
    onRenameAddress: (id, label) => setRenaming({ id, label }),
    onRemoveAddress: (id, address) => setRemoving({ id, address }),
  }

  const openCount = figures?.openCount

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Wrapped in its own div, so the shell's table line under a header
          never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader
          className={cn("gap-1", page?.coverUrl && "border-b-transparent")}
        >
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <span className="grid min-w-0 flex-1 pl-1 leading-tight">
            <span className={cn("truncate", dashboardCardHeadingClassName)}>CRM</span>
            {openCount !== undefined ? (
              <span className="truncate text-xs text-muted-foreground">
                {openCount} open {plural(openCount, "conversation")}
              </span>
            ) : null}
          </span>
          <AddAddressButton onAdded={onFiguresChanged} />
          {page ? (
            <TabbedMenu
              label="CRM settings"
              align="end"
              tabs={[
                {
                  value: "general",
                  label: "General",
                  content: (
                    <div className="grid gap-3 p-3">
                      <PickGroup
                        title="Chase"
                        after={
                          <p className="px-0.5 text-xs text-muted-foreground">
                            When they wrote last and nobody has answered, the bell says so once.
                          </p>
                        }
                      >
                        <PickMenuRow
                          label="Unanswered mail"
                          value={
                            figures?.unansweredDays
                              ? `After ${figures.unansweredDays} ${plural(figures.unansweredDays, "day")}`
                              : "Off"
                          }
                          empty={!figures?.unansweredDays}
                          options={CHASE_CHOICES.map((days) => ({
                            value: String(days),
                            label: days ? `After ${days} ${plural(days, "day")}` : "Off",
                          }))}
                          selected={String(figures?.unansweredDays ?? 3)}
                          onPick={(value) => {
                            void setCrmUnansweredDays(Number(value))
                              .then(onFiguresChanged)
                              .catch((error) => showErrorToast(getCrmPageErrorMessage(error)))
                          }}
                        />
                      </PickGroup>
                      <PickGroup title="Page">
                        <CoverRow
                          cover={{ url: page.coverUrl, busy, set: (url) => void setCover(url) }}
                        />
                      </PickGroup>
                      <LockRow
                        locked={page.locked}
                        busy={busy}
                        onLock={(locked) => void setLocked(locked)}
                      />
                    </div>
                  ),
                },
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page ? (
            <CrmBlocksProvider value={provided}>
              <SavingDocument
                // A lock reads again from the start, so the editor and the
                // lock always agree on what the page holds.
                key={page.locked ? "locked" : "open"}
                value={page.body}
                locked={page.locked}
                appBlocks={CRM_APP_BLOCKS}
                placeholder="Write something, or type / for blocks"
                onSave={async (body) => {
                  try {
                    await saveCrmPage(body)
                    onPageChange({ ...page, body })
                  } catch (error) {
                    showErrorToast(getCrmPageErrorMessage(error))
                  }
                }}
              />
            </CrmBlocksProvider>
          ) : (
            <LoadingRow label="Reading the page…" />
          )}
        </div>
      </ScrollArea>

      <RenameAddressDialog
        target={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={onFiguresChanged}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title="Take this address off the list?"
        description={`Mail sent to ${removing?.address ?? "it"} stops being filed under it, and replies stop going out from it. The conversations that came to it stay in the inbox.`}
        confirmLabel="Remove"
        onConfirm={() => void (async () => {
          if (!removing) return
          try {
            await removeCrmAddress(removing.id)
            setRemoving(null)
            onFiguresChanged()
          } catch (error) {
            showErrorToast(getCrmPageErrorMessage(error))
          }
        })()}
      />
    </div>
  )
}

/** The chase's choices, in days; 0 is off. */
const CHASE_CHOICES = [0, 1, 2, 3, 5, 7, 14]

/**
 * The + in the left header: adds an address mail arrives at, such as
 * support@, with a short name for it. Mail only arrives once Resend has
 * the address too (`workspace/docs/crm/inbox-and-leads.md`, "Setting it up").
 */
function AddAddressButton({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [address, setAddress] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [adding, setAdding] = React.useState(false)

  const add = async () => {
    if (!address.trim() || adding) return
    setAdding(true)
    try {
      const added = await addCrmAddress(address.trim(), label.trim() || undefined)
      toast.success(`Mail to ${added.address} now lands here.`)
      setAddress("")
      setLabel("")
      setOpen(false)
      onAdded()
    } catch (error) {
      showErrorToast(getCrmPageErrorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add an address mail arrives at"
              className={cn("shrink-0", open && "bg-muted")}
            >
              <PlusIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Add an address mail arrives at</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="grid w-[min(20rem,calc(100vw-2rem))] gap-3 p-3">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="crm-new-address">Address</FieldLabel>
            <Input
              id="crm-new-address"
              autoFocus
              type="email"
              value={address}
              placeholder="support@inbox.example.com"
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="crm-new-address-label">Name for it</FieldLabel>
            <Input
              id="crm-new-address-label"
              value={label}
              placeholder="Support"
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function RenameAddressDialog({
  target,
  onClose,
  onRenamed,
}: {
  target: { id: string; label: string } | null
  onClose: () => void
  onRenamed: () => void
}) {
  const [label, setLabel] = React.useState("")
  const [shownFor, setShownFor] = React.useState<string | null>(null)
  if ((target?.id ?? null) !== shownFor) {
    setShownFor(target?.id ?? null)
    setLabel(target?.label ?? "")
  }
  const [saving, setSaving] = React.useState(false)

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename the address</DialogTitle>
        </DialogHeader>
        <form
          id="crm-rename-address"
          className="grid gap-1.5"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!target) return
            setSaving(true)
            try {
              await renameCrmAddress(target.id, label)
              onClose()
              onRenamed()
            } catch (error) {
              showErrorToast(getCrmPageErrorMessage(error))
            } finally {
              setSaving(false)
            }
          }}
        >
          <FieldLabel htmlFor="crm-rename-address-label">Name for it</FieldLabel>
          <Input
            id="crm-rename-address-label"
            autoFocus
            value={label}
            maxLength={80}
            placeholder="Support"
            onChange={(event) => setLabel(event.target.value)}
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="crm-rename-address" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
