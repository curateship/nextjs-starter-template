import * as React from "react"
import {
  EllipsisVerticalIcon,
  FlaskConicalIcon,
  LinkIcon,
  Loader2Icon,
  MaximizeIcon,
  PauseIcon,
  PlayIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { PhoneActionsPanel } from "@/components/phones/phone-actions-panel"
import { PhoneHealthPanel } from "@/components/phones/phone-health-panel"
import { PhoneHistoryPanel } from "@/components/phones/phone-history-panel"
import { PhoneJobsPanel } from "@/components/phones/phone-jobs-panel"
import { PhoneScreen, PhoneScreenDialog } from "@/components/phones/phone-screen-dialog"
import { PhoneSettingsSection } from "@/components/phones/phone-settings-section"
import { PhoneSetupPanel } from "@/components/phones/phone-setup-panel"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { changePhones, getPhoneErrorMessage, type PhoneRecord, type RackPage } from "@/lib/api/phones/phones"
import { saveTestPhone } from "@/lib/api/phones/settings"
import { signedInWords } from "@/lib/browser/wording"
import { PHONE_KIND_WORDS, PHONE_STATUS_WORDS } from "@/lib/phones/options"
import { STATUS_DOT } from "@/lib/phones/status-dot"
import { setupWarning } from "@/lib/phones/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The phone's sections in its ⋮. */
type PhoneSection = "settings" | "setup" | "health" | "actions" | "jobs" | "history"

/**
 * The right panel of a rack's page: the open phone (Racks dashboard, parts
 * 107 to 117; Tyler, 5 Nov 2026: "phone detail and screen"). Its header is
 * the phone's name and status, Hold or Release, and the ⋮. Under it, the
 * phone's live screen, always. Everything else about the phone is in the ⋮
 * (Tyler, 6 Nov 2026: "All these options should go into the 3 vertical dots
 * dropdown"): Settings, Setup, Health, Actions, Jobs and History fold open
 * inside it, then the bigger screen, Copy link, Use as the self-test phone
 * and Delete. There is no ×: the panel always holds a phone, the first one
 * on arrival.
 *
 * The phone comes from the page's own list, so the panel follows the list's
 * 10-second read without asking again (part 110).
 */
export function PhonePanel({
  phone,
  page,
  onChanged,
  onDeleted,
}: {
  phone: PhoneRecord | null
  page: RackPage
  onChanged: () => Promise<void>
  /** The phone went: the page opens the next one (part 117). */
  onDeleted: (phoneId: string) => void
}) {
  if (!phone) {
    return (
      <>
        <DashboardCardTitleHeader icon={<SmartphoneIcon className="size-4" />} title="Phone" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <SmartphoneIcon className="size-6" aria-hidden />
          <p className="max-w-60">
            A phone opens here once this rack has one. Plug one in with USB debugging allowed, or press New phone.
          </p>
        </div>
      </>
    )
  }
  return <OpenPhone key={phone.id} phone={phone} page={page} onChanged={onChanged} onDeleted={onDeleted} />
}

function OpenPhone({
  phone,
  page,
  onChanged,
  onDeleted,
}: {
  phone: PhoneRecord
  page: RackPage
  onChanged: () => Promise<void>
  onDeleted: (phoneId: string) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [wideScreen, setWideScreen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const testPhone = phone.id === page.testPhoneId || phone.id === page.testPhoneIphoneId

  async function hold() {
    setBusy(true)
    try {
      await changePhones({ action: "hold", ids: [phone.id], held: !phone.held })
      toast.success(phone.held ? `${phone.name} is back in use.` : `${phone.name} is held. Its jobs wait until you release it.`)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const { done } = await changePhones({ action: "delete", ids: [phone.id] })
      if (done.length) toast.success(`${phone.name} is deleted.`)
      setDeleting(false)
      onDeleted(phone.id)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<SmartphoneIcon className="size-4" />}
        title={phone.name}
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
            {PHONE_STATUS_WORDS[phone.status]}
          </span>
        }
        action={
          <div className="flex items-center gap-0.5">
            <Hint label={phone.held ? "Release: back in use" : "Hold: take it out of use"}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label={phone.held ? `Release ${phone.name}` : `Hold ${phone.name}`}
                onClick={() => void hold()}
              >
                {busy ? <Loader2Icon className="animate-spin" /> : phone.held ? <PlayIcon /> : <PauseIcon />}
              </Button>
            </Hint>
            <PhoneMenu
              phone={phone}
              page={page}
              testPhone={testPhone}
              onBigScreen={() => setWideScreen(true)}
              onDelete={() => setDeleting(true)}
              onChanged={onChanged}
            />
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid min-w-0 gap-3 p-3">
          <PhoneScreen phone={phone} onChanged={onChanged} />
        </div>
      </ScrollArea>

      <PhoneScreenDialog phone={wideScreen ? phone : null} onClose={() => setWideScreen(false)} onChanged={onChanged} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${phone.name}?`}
        description={[
          "Only the record goes. Nothing on the phone changes, and if it is still plugged in the rack adds it back as a new phone on its next check-in.",
          phone.accounts.length
            ? `${phone.accounts.map(signedInWords).join(", ")} will run on nothing until you pick a browser profile or phone for ${phone.accounts.length === 1 ? "it" : "them"} on the Accounts dashboard.`
            : "No account runs on it.",
        ].join(" ")}
        confirmLabel="Delete phone"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}

/**
 * The phone's ⋮, the shell's one dropdown look: Settings, Setup, Health,
 * Actions, Jobs and History as folding rows, each saying where it stands on
 * the right; then a line, the bigger screen window, Copy link, Use as the
 * self-test phone, and Delete in red. It opens leftward, over the list. A
 * row's body is drawn only while it is open, so a shut row reads nothing.
 */
function PhoneMenu({
  phone,
  page,
  testPhone,
  onBigScreen,
  onDelete,
  onChanged,
}: {
  phone: PhoneRecord
  page: RackPage
  testPhone: boolean
  onBigScreen: () => void
  onDelete: () => void
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [shown, toggle] = useOpenSections<PhoneSection>()
  const battery = phone.vitals.batteryPercent
  const setupWords = phone.setupChecking
    ? "Checking"
    : setupWarning(phone)
      ? "Needs a look"
      : phone.setupCheck
        ? "Checked"
        : "Not checked yet"

  /** Shuts the menu, then does the thing, so a window it opens is not behind it. */
  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  async function copyLink() {
    // The phone's own address, which lands on whatever rack it is on when opened.
    const link = `${window.location.origin}/admin/phones?open=${encodeURIComponent(phone.id)}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied. It opens this phone on its rack.")
    } catch {
      showErrorToast(`This browser would not copy. The link is ${link}`)
    }
  }

  async function pickForSelfTest() {
    setBusy(true)
    try {
      await saveTestPhone(phone.id, phone.kind)
      toast.success(`${phone.name} is the ${PHONE_KIND_WORDS[phone.kind]} self-test phone.`)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FoldingMenu
      label={`More for ${phone.name}`}
      open={open}
      onOpenChange={setOpen}
      // The small size, as the Hold button beside it, so the name keeps the room.
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${phone.name}`}>
          {busy ? <Loader2Icon className="animate-spin" /> : <EllipsisVerticalIcon />}
        </Button>
      }
    >
      <MenuSection label="Settings" value={phone.model || PHONE_KIND_WORDS[phone.kind]} open={shown.has("settings")} onToggle={() => toggle("settings")}>
        <PhoneSettingsSection phone={phone} page={page} onSaved={onChanged} />
      </MenuSection>
      <MenuSection label="Setup" value={setupWords} open={shown.has("setup")} onToggle={() => toggle("setup")}>
        <PhoneSetupPanel phone={phone} onChanged={onChanged} />
      </MenuSection>
      <MenuSection
        label="Health"
        value={battery === null ? "" : `${battery}% battery`}
        open={shown.has("health")}
        onToggle={() => toggle("health")}
      >
        <PhoneHealthPanel phone={phone} />
      </MenuSection>
      <MenuSection label="Actions" value="" open={shown.has("actions")} onToggle={() => toggle("actions")}>
        <PhoneActionsPanel phone={phone} onChanged={onChanged} />
      </MenuSection>
      <MenuSection label="Jobs" value="" open={shown.has("jobs")} onToggle={() => toggle("jobs")}>
        <PhoneJobsPanel phoneId={phone.id} />
      </MenuSection>
      <MenuSection label="History" value="" open={shown.has("history")} onToggle={() => toggle("history")}>
        <PhoneHistoryPanel phoneId={phone.id} />
      </MenuSection>
      <MenuLine />
      <MenuAction icon={<MaximizeIcon className="size-4" />} onClick={then(onBigScreen)}>
        Open the bigger screen
      </MenuAction>
      <MenuAction icon={<LinkIcon className="size-4" />} onClick={then(() => void copyLink())}>
        Copy link
      </MenuAction>
      {testPhone ? null : (
        <MenuAction icon={<FlaskConicalIcon className="size-4" />} disabled={busy} onClick={then(() => void pickForSelfTest())}>
          Use as the self-test phone
        </MenuAction>
      )}
      <MenuLine />
      <MenuAction icon={<Trash2Icon className="size-4" />} destructive onClick={then(onDelete)}>
        Delete phone
      </MenuAction>
    </FoldingMenu>
  )
}
