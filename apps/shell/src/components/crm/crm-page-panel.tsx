import * as React from "react"
import { ChevronRightIcon, MailIcon, NewspaperIcon, PlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { CRM_APP_BLOCKS, CrmBlocksProvider, type CrmBlocks } from "@/components/crm/crm-blocks"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { NameDialog } from "@/components/shared/dashboard/name-dialog"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { createBroadcast, getBroadcastErrorMessage } from "@/lib/api/email/broadcasts"
import type { StoredPage } from "@/lib/notes/page-body"
import { dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { SYSTEM_EMAIL_KINDS, SYSTEM_EMAIL_META, type SystemEmailKind } from "@/lib/system-emails/kinds"
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
  onOpenSystemEmail,
  openSystemEmail,
  onNewsletterCreated,
}: {
  /** Null while the page is first read. */
  page: StoredPage | null
  figures: CrmBlockFigures | null
  blocks: Omit<CrmBlocks, "figures">
  onPageChange: (page: StoredPage) => void
  /** Reads the figures again, and the inbox with them, after an address changed. */
  onFiguresChanged: () => void
  /** Opens one of the app's own emails on the right, from the System emails tab. */
  onOpenSystemEmail: (kind: SystemEmailKind) => void
  /** The one open on the right, so its row looks picked. */
  openSystemEmail: SystemEmailKind | null
  /** Opens a newsletter just made from the + menu on the Broadcasts tab. */
  onNewsletterCreated: (broadcastId: string) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
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
          <AddMenuButton
            onAddressAdded={onFiguresChanged}
            onNewSegment={blocks.onNewSegment}
            onNewsletterCreated={onNewsletterCreated}
          />
          {page ? (
            <TabbedMenu
              label="CRM settings"
              // Opens to the right, over the list, rather than past the
              // panel's left edge (Tyler, 7 Nov 2026: "align settings
              // dropdown to the right").
              align="start"
              open={menuOpen}
              onOpenChange={setMenuOpen}
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
                {
                  // The addresses mail arrives at, moved here from a block on
                  // the page (Tyler, 7 Nov 2026: "move the email block to the
                  // settings"). Pressing one narrows the inbox to it.
                  value: "emails",
                  label: "Emails",
                  content: (
                    <div className="grid gap-3 p-3">
                      <PickGroup
                        title="Mail arrives at"
                        after={
                          <p className="px-0.5 text-xs text-muted-foreground">
                            The + at the top adds another. Pressing one shows only its mail in the inbox.
                          </p>
                        }
                      >
                        {(figures?.emails ?? []).length === 0 ? (
                          <p className="px-3 py-2.5 text-sm text-muted-foreground">No address yet.</p>
                        ) : (
                          (figures?.emails ?? []).map((email) => {
                            const lowered = email.address.toLowerCase()
                            const picked = blocks.activeAddress === lowered
                            return (
                              <div key={email.id} className={cn("flex min-h-11 items-center gap-1 pr-1.5", picked && "bg-muted")}>
                                <button
                                  type="button"
                                  aria-current={picked ? "true" : undefined}
                                  onClick={() => {
                                    setMenuOpen(false)
                                    blocks.onAddress(picked ? "" : lowered)
                                  }}
                                  className={cn("grid min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-muted", focusRingInset)}
                                >
                                  <span className="truncate">{email.label || email.address}</span>
                                  {email.label ? (
                                    <span className="truncate text-xs text-muted-foreground">{email.address}</span>
                                  ) : null}
                                </button>
                                <span className="text-xs text-muted-foreground tabular-nums">{email.open} open</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setMenuOpen(false)
                                    setRenaming({ id: email.id, label: email.label })
                                  }}
                                >
                                  Rename
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setMenuOpen(false)
                                    setRemoving({ id: email.id, address: email.address })
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            )
                          })
                        )}
                      </PickGroup>
                    </div>
                  ),
                },
                {
                  // Tyler, 7 Nov 2026: system emails are "a tab in the CRM
                  // settings ⋮. Opening a kind puts its editor in the right
                  // panel."
                  value: "system",
                  label: "System emails",
                  content: (
                    <div className="grid gap-3 p-3">
                      <PickGroup
                        title="Sent by the app"
                        after={
                          <p className="px-0.5 text-xs text-muted-foreground">
                            The app sends these itself. Pressing one opens it on the right to change its words.
                          </p>
                        }
                      >
                        {SYSTEM_EMAIL_KINDS.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            aria-current={openSystemEmail === kind ? "true" : undefined}
                            onClick={() => {
                              setMenuOpen(false)
                              onOpenSystemEmail(kind)
                            }}
                            className={cn(
                              "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted",
                              openSystemEmail === kind && "bg-muted",
                              focusRingInset
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">{SYSTEM_EMAIL_META[kind].name}</span>
                            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                          </button>
                        ))}
                      </PickGroup>
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
 * The + in the left header: a menu of the three things the CRM starts
 * (Tyler, 7 Nov 2026: "make this open to a dropdown that I can select add an
 * email, add a segment and add a newsletter").
 *
 * - **Add a person:** an address mail arrives at, such as support@, with a
 *   short name for it. Mail only arrives once Resend has the address too
 *   (`workspace/docs/crm/inbox-and-leads.md`, "Setting it up").
 * - **Add a segment:** the People tab's new segment window.
 * - **Add a newsletter:** a name, then the newsletter opens on the
 *   Broadcasts tab to write.
 */
function AddMenuButton({
  onAddressAdded,
  onNewSegment,
  onNewsletterCreated,
}: {
  onAddressAdded: () => void
  onNewSegment: () => void
  onNewsletterCreated: (broadcastId: string) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [addingAddress, setAddingAddress] = React.useState(false)
  const [namingNewsletter, setNamingNewsletter] = React.useState(false)

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Add to the CRM"
            className={cn("shrink-0", menuOpen && "bg-muted")}
          >
            <PlusIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => setAddingAddress(true)}>
            <MailIcon className="size-4 text-muted-foreground" />
            Add a person
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewSegment}>
            <UsersIcon className="size-4 text-muted-foreground" />
            Add a segment
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNamingNewsletter(true)}>
            <NewspaperIcon className="size-4 text-muted-foreground" />
            Add a newsletter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddAddressDialog
        open={addingAddress}
        onClose={() => setAddingAddress(false)}
        onAdded={onAddressAdded}
      />
      <NewNewsletterDialog
        open={namingNewsletter}
        onClose={() => setNamingNewsletter(false)}
        onCreated={onNewsletterCreated}
      />
    </>
  )
}

function AddAddressDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
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
      onClose()
      onAdded()
    } catch (error) {
      showErrorToast(getCrmPageErrorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
        </DialogHeader>
        <form
          id="crm-new-address-form"
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
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="crm-new-address-form" disabled={adding}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewNewsletterDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (broadcastId: string) => void
}) {
  const [name, setName] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const create = async () => {
    if (creating) return
    if (!name.trim()) {
      showErrorToast("Give the newsletter a name first.")
      return
    }
    setCreating(true)
    try {
      const made = await createBroadcast(name.trim())
      setName("")
      onClose()
      onCreated(made.id)
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <NameDialog
      open={open}
      title="Add a newsletter"
      description="Name it, then it opens on Broadcasts to write. Only you see the name."
      cardTitle="Newsletter details"
      inputId="crm-new-newsletter-name"
      value={name}
      onValueChange={setName}
      maxLength={255}
      placeholder="March update"
      busy={creating}
      submitLabel="Create newsletter"
      onSubmit={() => void create()}
      onClose={() => {
        setName("")
        onClose()
      }}
    />
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
