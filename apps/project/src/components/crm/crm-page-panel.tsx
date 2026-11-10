import * as React from "react"
import { HandshakeIcon, NewspaperIcon, PencilIcon, PlusIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { CRM_APP_BLOCKS, CrmBlocksProvider, CrmSectionsBlock, type CrmBlocks } from "@/components/crm/crm-blocks"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { MenuFooterButton, TabbedMenu, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { useSubscriberForm } from "@/components/broadcasts/new-contact-dropdown"
import { useBroadcastForm, useSegmentForm } from "@/components/crm/crm-add-forms"
import { useLeadForm } from "@/components/crm/new-lead-dropdown"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
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
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
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
import { contactFilterOptions, getContactErrorMessage, loadContactsPage } from "@/lib/api/people/contacts"
import type { SegmentRuleOptions } from "@/lib/contacts/contact-segments"
import { pageWithoutBlock, type StoredPage } from "@/lib/notes/page-body"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import { dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The CRM dashboard's left panel (the Admin 3 panel design, 7 Nov 2026;
 * Tyler: "Left panel list blocks like emails, I want to add new emails to the
 * CRM so we'd need to add a + in the top header").
 *
 * - **Header:** the collapse button, "CRM", the
 *   **+** that adds an address mail arrives at, and the ⋮ (CRM settings:
 *   General, Emails, and Widgets for Overview; System emails is a section
 *   of its own since 9 Nov 2026).
 * - **Page:** one per site, written on like any page in the design, with the
 *   fixed Dashboards block that picks the section, and the "/" blocks: the
 *   basic ones, and the CRM's Follow up today, Waiting on you, Segments and
 *   Stages (`crm-blocks.tsx`). A new site starts with Dashboards and Follow
 *   up today. While the page is read, or when it could not be, the
 *   Dashboards block is drawn on its own: it is the only way between the
 *   sections.
 */
export function CrmPagePanel({
  page,
  error,
  onRetry,
  figures,
  blocks,
  widgets,
  menuState,
  onPageChange,
  onFiguresChanged,
}: {
  /** Null while the page is first read, or when the read failed. */
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  figures: CrmBlockFigures | null
  blocks: Omit<CrmBlocks, "figures">
  /** The ⋮'s Widgets tab: Overview's rows and spots. */
  widgets: React.ReactNode
  /** The ⋮'s open state and tab, held by the dashboard so a widget's Manage widgets opens it at Widgets. */
  menuState: TabbedMenuState
  onPageChange: (page: StoredPage) => void
  /** Reads the figures again, and the inbox with them, after an address changed. */
  onFiguresChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const { open: menuOpen, onOpenChange: setMenuOpen } = menuState
  const [removing, setRemoving] = React.useState<{ id: string; address: string } | null>(null)
  const [addingAddress, setAddingAddress] = React.useState(false)

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

  // Delete block on the locked page: unlocked, then saved without the block
  // (Tyler, 9 Nov 2026: "Ask, then unlock and delete").
  const lockedPage = page
    ? {
        locked: page.locked,
        removeBlock: async (nodeName: string) => {
          const body = pageWithoutBlock(page.body, nodeName)
          setBusy(true)
          try {
            await lockCrmPage(false)
            await saveCrmPage(body)
            onPageChange({ ...page, locked: false, body })
          } catch (error) {
            showErrorToast(getCrmPageErrorMessage(error))
          } finally {
            setBusy(false)
          }
        },
      }
    : null

  const setCover = async (cover: { coverUrl: string | null; coverImages: string[] }) => {
    if (!page) return
    setBusy(true)
    try {
      await setCrmPageCoverPhoto(cover)
      onPageChange({ ...page, ...cover })
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
          {/* The name alone, as the Admin header has it (Tyler, 9 Nov 2026:
              "remove this label", of the open conversations under it). */}
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>CRM</span>
          <AddMenuButton onAdded={onFiguresChanged} />
          {page ? (
            <TabbedMenu
              label="CRM settings"
              // Opens to the right, over the list, rather than past the
              // panel's left edge (Tyler, 7 Nov 2026: "align settings
              // dropdown to the right").
              align="start"
              // 25rem, then 10% narrower twice (Tyler, 9 Nov 2026: "reduce the
              // left panel dropdown width by 10%" for the Admin ⋮, "apply all
              // the design pattern we did for dashboard to crm", then
              // "Resize the dropdown 10% narrower").
              width="20.25rem"
              open={menuOpen}
              onOpenChange={setMenuOpen}
              tab={menuState.tab}
              onTabChange={menuState.onTabChange}
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
                          cover={{
                            url: page.coverUrl,
                            images: page.coverImages,
                            busy,
                            set: ({ url, images }) => void setCover({ coverUrl: url, coverImages: images }),
                          }}
                        />
                      </PickGroup>
                    </div>
                  ),
                  footer: (
                    <LockRow
                      locked={page.locked}
                      busy={busy}
                      onLock={(locked) => void setLocked(locked)}
                    />
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
                      {/* No line of help under it, no open count on a row, and
                          a pencil and a bin in place of Rename and Remove
                          (Tyler, 9 Nov 2026: "remove \"The + at the top
                          adds another...\" change these into icons
                          instead", and "Remove this" of "7 open"). */}
                      <PickGroup title="Mail arrives at">
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
                                <RenameAddressPopover
                                  address={email}
                                  onRenamed={onFiguresChanged}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${email.address}`}
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    setMenuOpen(false)
                                    setRemoving({ id: email.id, address: email.address })
                                  }}
                                >
                                  <Trash2Icon className="size-4" />
                                </Button>
                              </div>
                            )
                          })
                        )}
                      </PickGroup>
                    </div>
                  ),
                  // Moved here from the left header's + (9 Nov 2026), which
                  // now adds subscribers, leads, segments and broadcasts.
                  footer: (
                    <MenuFooterButton
                      icon={<PlusIcon />}
                      onClick={() => {
                        setMenuOpen(false)
                        setAddingAddress(true)
                      }}
                    >
                      Add address
                    </MenuFooterButton>
                  ),
                },
                { value: "widgets", label: "Widgets", content: widgets },
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page ? (
            <CrmBlocksProvider value={provided}>
              <LockedPageContext.Provider value={lockedPage}>
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
              </LockedPageContext.Provider>
            </CrmBlocksProvider>
          ) : (
            <>
              <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                <CrmBlocksProvider value={provided}>
                  <CrmSectionsBlock />
                </CrmBlocksProvider>
              </div>
              {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
            </>
          )}
        </div>
      </ScrollArea>

      <AddAddressDialog open={addingAddress} onClose={() => setAddingAddress(false)} onAdded={onFiguresChanged} />
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

type AddKind = "subscriber" | "lead" | "segment" | "broadcast"

/**
 * The + in the left header: the four things the CRM adds (Tyler, 9 Nov 2026:
 * "The left header dropdown should now chnage to: Add a subscriber, add a
 * lead, add a segment and add a broadcast", then "remove the \"a\" so its
 * just Add subscriber").
 *
 * Picking one turns the dropdown into its form, and making it keeps the
 * admin where they are: nothing moves to another section or opens a window
 * ("in crm. Fix all of these ... they either forward somewhere else or open a
 * modal"). The subscriber and lead forms are Subscribers' and Leads' own;
 * Add segment is a segment from rules (`crm-add-forms.tsx`); Add broadcast
 * makes a draft newsletter by its name, written in Broadcasts.
 *
 * Adding an address mail arrives at moved to the ⋮'s Emails tab.
 */
function AddMenuButton({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [making, setMaking] = React.useState<AddKind | null>(null)
  // The tags in use and the rule builder's choices, read once a form that
  // needs them is picked.
  const needsOptions = making === "subscriber" || making === "segment"
  const [options, setOptions] = React.useState<SegmentRuleOptions | null>(null)
  React.useEffect(() => {
    if (!needsOptions || options) return
    let cancelled = false
    loadContactsPage({ limit: 1 })
      .then((page) => {
        if (!cancelled) setOptions(contactFilterOptions(page))
      })
      .catch((error) => showErrorToast(getContactErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [needsOptions, options])

  const added = async () => {
    // A new segment or person changes the left page's blocks too.
    setOptions(null)
    onAdded()
  }
  const forms = {
    subscriber: useSubscriberForm(options?.tags ?? [], added),
    lead: useLeadForm(added),
    segment: useSegmentForm(options, added),
    broadcast: useBroadcastForm(added),
  }
  const form = making ? forms[making] : null
  const LABELS: Record<AddKind, { label: string; submit: string }> = {
    subscriber: { label: "Add subscriber", submit: "Create contact" },
    lead: { label: "Add lead", submit: "Create lead" },
    segment: { label: "Add segment", submit: "Create segment" },
    broadcast: { label: "Add broadcast", submit: "Create newsletter" },
  }
  const choice = (kind: AddKind, icon: React.ReactNode) => (
    <Button
      type="button"
      role="menuitem"
      variant="ghost"
      className="w-full justify-start gap-2 px-2 font-normal"
      onClick={() => setMaking(kind)}
    >
      {icon}
      {LABELS[kind].label}
    </Button>
  )

  return (
    <NewRecordDropdown
      label={making ? LABELS[making].label : "Add to the CRM"}
      align="start"
      wide={making === "segment"}
      open={open}
      onOpenChange={(next) => {
        // Each opening starts at the four choices.
        if (next) setMaking(null)
        setOpen(next)
      }}
      choices={
        making === null ? (
          <div className="grid" role="menu" aria-label="Add to the CRM">
            {choice("subscriber", <UserPlusIcon className="size-4 text-muted-foreground" />)}
            {choice("lead", <HandshakeIcon className="size-4 text-muted-foreground" />)}
            {choice("segment", <UsersIcon className="size-4 text-muted-foreground" />)}
            {choice("broadcast", <NewspaperIcon className="size-4 text-muted-foreground" />)}
          </div>
        ) : undefined
      }
      submitLabel={making ? LABELS[making].submit : ""}
      busy={form?.saving ?? false}
      onSubmit={() =>
        void form?.submit().then((created) => {
          if (created) setOpen(false)
        })
      }
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add to the CRM"
          className={cn("shrink-0", open && "bg-muted")}
        >
          <PlusIcon className="size-4" />
        </Button>
      }
    >
      {form?.fields}
    </NewRecordDropdown>
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
          <DialogTitle>Add address</DialogTitle>
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

/**
 * Rename an address the mail arrives at: a small box by the pencil, not a
 * window (Tyler, 9 Nov 2026: "the rename shouldnt open a modal, make it a
 * popover instead"). It opens over the CRM settings ⋮, which stays open
 * behind it. Enter saves, Escape or Cancel leaves it as it was.
 */
function RenameAddressPopover({
  address,
  onRenamed,
}: {
  address: { id: string; address: string; label: string }
  onRenamed: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState(address.label)
  const [saving, setSaving] = React.useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setLabel(address.label)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Rename ${address.label || address.address}`}
          className={cn("text-muted-foreground", open && "bg-muted")}
        >
          <PencilIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <form
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            setSaving(true)
            try {
              await renameCrmAddress(address.id, label)
              setOpen(false)
              onRenamed()
            } catch (error) {
              showErrorToast(getCrmPageErrorMessage(error))
            } finally {
              setSaving(false)
            }
          }}
        >
          <FieldLabel htmlFor={`crm-rename-${address.id}`}>Name for it</FieldLabel>
          <Input
            id={`crm-rename-${address.id}`}
            autoFocus
            value={label}
            maxLength={80}
            placeholder="Support"
            onChange={(event) => setLabel(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
