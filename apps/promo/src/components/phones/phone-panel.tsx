import * as React from "react"
import {
  EraserIcon,
  FlaskConicalIcon,
  HeartPulseIcon,
  LinkIcon,
  Loader2Icon,
  MaximizeIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react"

import { PhoneActionsPanel } from "@/components/phones/phone-actions-panel"
import { PhoneHealthPanel } from "@/components/phones/phone-health-panel"
import { PhoneHistoryPanel } from "@/components/phones/phone-history-panel"
import { PhoneJobsPanel } from "@/components/phones/phone-jobs-panel"
import { PhoneScreen, PhoneScreenDialog } from "@/components/phones/phone-screen-dialog"
import { FlatSections, PhoneSectionCard } from "@/components/phones/phone-section-card"
import { PhoneStatusText } from "@/components/phones/phone-status"
import { PhoneSettingsSection } from "@/components/phones/phone-settings-section"
import { PhoneSetupPanel } from "@/components/phones/phone-setup-panel"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { ActionRow } from "@/components/crm/crm-record-menu"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  changePhones,
  getPhoneErrorMessage,
  runPhoneAction,
  runSetupCheck,
  wipePhone,
  type PhoneRecord,
  type PhonesPage,
} from "@/lib/api/phones/phones"
import { saveTestPhone } from "@/lib/api/phones/settings"
import { bannedOnWords } from "@/lib/bans/options"
import { signedInWords } from "@/lib/browser/wording"
import { PHONE_STATUS_WORDS } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The tabs under the phone's header. */
type PhoneTab = "phone" | "health" | "jobs" | "history"
const PHONE_TABS: { value: PhoneTab; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "health", label: "Health" },
  { value: "jobs", label: "Jobs" },
  // Out of the ⋮ (Tyler, 12 Nov 2026: "move history as its 4th tab").
  { value: "history", label: "History" },
]

/**
 * The open phone, on the right of the Anti Detect dashboard's Phones (Racks
 * dashboard, parts 107 to 117; Tyler, 5 Nov 2026: "phone detail and
 * screen"), in the shell's record frame. Its header is the phone's name and
 * status, Hold or Release, and the ⋮. Under it, the phone's live screen,
 * always, and in its footer the typing with the keys under it. Everything else about the phone is in the ⋮
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
  page: PhonesPage
  onChanged: () => Promise<void>
  /** The phone went: the page opens the next one (part 117). */
  onDeleted: (phoneId: string) => void
}) {
  if (!phone) {
    return (
      <EmptyRecord
        title="Phone"
        icon={<SmartphoneIcon aria-hidden />}
        line="A phone opens here once there is one. Plug one into a rack with USB debugging allowed, or press New phone."
        hideLabel="Hide the phone"
      />
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
  page: PhonesPage
  onChanged: () => Promise<void>
  onDeleted: (phoneId: string) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [wideScreen, setWideScreen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [wiping, setWiping] = React.useState(false)
  const [wipeBusy, setWipeBusy] = React.useState(false)
  const [footer, setFooter] = React.useState<HTMLDivElement | null>(null)
  const [controlSlot, setControlSlot] = React.useState<HTMLDivElement | null>(null)
  const [control, setControl] = React.useState(false)
  const [tab, setTab] = React.useState<PhoneTab>("phone")
  // Underlined, 32px apart, as the ⋮'s tab row (Tyler, 12 Nov 2026: "why did you change the tabs spacing?").
  // A panel too narrow for all four scrolls the row sideways, as every tab row does.
  const tabs = (
    <DashboardTabs
      style="underline"
      className="my-0 [&_[role=tablist]]:gap-8"
      value={tab}
      onValueChange={(next) => setTab(next as PhoneTab)}
      tabs={PHONE_TABS}
    />
  )
  const testPhone = phone.id === page.testPhoneId || phone.id === page.testPhoneIphoneId

  async function hold() {
    setBusy(true)
    try {
      await changePhones({ action: "hold", ids: [phone.id], held: !phone.held })
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
      await changePhones({ action: "delete", ids: [phone.id] })
      setDeleting(false)
      onDeleted(phone.id)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function wipe() {
    setWipeBusy(true)
    try {
      await wipePhone(phone!.id)
      setWiping(false)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setWipeBusy(false)
    }
  }

  return (
    <>
      {/* The shell's record frame, as every right panel is: its cards edge to edge, and a footer, where the
          typing and the keys go (Tyler, 12 Nov 2026: "the right cards are not flushed to the edge", "The icon
          controls goes into the footer bottom and the phone chat goes a row above it"). */}
      <RecordFrame
        avatar={<SmartphoneIcon aria-hidden />}
        title={phone.name}
        line={PHONE_STATUS_WORDS[phone.status]}
        hideLabel="Hide the phone"
        // Straight into the header, so Hold, the ⋮ and the collapse button sit the header's one gap apart.
        actions={
          <>
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
              onWipe={() => setWiping(true)}
              onChanged={onChanged}
              control={tab === "phone" ? control : null}
              onControlSlot={setControlSlot}
            />
          </>
        }
        body={
          <>
            {/* Phone, Health and Jobs as tabs under the header (Tyler, 12 Nov 2026: "Add 3 tabs here. first
                tab Phone, Health, Jobs"), in the site's tab style. Leaving Phone closes the screen, as leaving
                the panel does, so control goes with it. */}
            {tab === "phone" ? (
              <PhoneScreen
                phone={phone}
                onChanged={onChanged}
                footer={footer}
                controlSlot={controlSlot}
                onControl={setControl}
                frame={(screen) => (
                  <PhoneBox
                    tabs={tabs}
                    // The phone's own details at the bottom of the phone (Tyler, 12 Nov 2026: "move these info to the
                    // bottom of the phone"); the rest of Settings stays in the ⋮.
                    foot={<PhoneSettingsSection phone={phone} page={page} onSaved={onChanged} part="phone" />}
                  >
                    {screen}
                  </PhoneBox>
                )}
              />
            ) : (
              <PhoneBox tabs={tabs}>
                <div className="grid min-w-0 gap-4 bg-card p-3">
                  {tab === "health" ? (
                    <FlatSections>
                      <PhoneHealthPanel phone={phone} />
                    </FlatSections>
                  ) : tab === "jobs" ? (
                    <PhoneJobsPanel phoneId={phone.id} />
                  ) : (
                    <FlatSections>
                      {/* Where it stands, at the head of its history (Tyler, 12 Nov 2026: "this belong in history"). */}
                      <PhoneSectionCard storageId="promo-phone-history-now" title="Now">
                        <div className="grid gap-1">
                          <PhoneStatusText phone={phone} />
                          <p className="text-muted-foreground">
                            {phone.accounts.length ? `On it: ${phone.accounts.map(signedInWords).join(", ")}.` : "No account runs on it yet."}
                          </p>
                          {bannedOnWords(phone.bannedOn) ? <p className="text-destructive">Banned on: {bannedOnWords(phone.bannedOn)}.</p> : null}
                        </div>
                      </PhoneSectionCard>
                      <PhoneHistoryPanel phoneId={phone.id} />
                    </FlatSections>
                  )}
                </div>
              </PhoneBox>
            )}
          </>
        }
        // The typing and the keys, only while the screen shows.
        footer={tab === "phone" ? <div ref={setFooter} className="w-full min-w-0" /> : undefined}
      />

      <ConfirmDialog
        open={wiping}
        onOpenChange={setWiping}
        title={`Wipe ${phone.name}?`}
        description={
          phone.kind === "iphone"
            ? "The rack walks Settings to Erase All Content and Settings and presses it: every app, account, photo and setting on it is erased. It goes only if the rack read the phone as signed out of iCloud since its last wipe (Check iCloud, under Setup in the ⋮). Afterwards it is held while you set it up by hand (tap Trust this computer, sign in to an Apple ID, put the apps on from the App Store), then release it and run its setup check. It takes an account again once that check passes."
            : "The rack factory-resets it: every app, account, photo and setting on it is erased, and USB debugging goes off. Afterwards it is held while you set it up by hand (USB debugging, Google, the apps), then release it and run its setup check. It takes an account again once that check passes."
        }
        confirmLabel="Wipe the phone"
        loading={wipeBusy}
        onConfirm={() => void wipe()}
      />
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
 * The phone's ⋮, the design's tabbed record menu: **Settings** (Control's
 * switch while the screen shows, the phone's fields as rows, then what can be
 * asked of the phone, and Wipe and Delete in red), **Setup** and **Actions**.
 * A tab's body is drawn only while it shows, so a tab not picked reads
 * nothing.
 */
function PhoneMenu({
  phone,
  page,
  testPhone,
  onBigScreen,
  onDelete,
  onWipe,
  onChanged,
  control,
  onControlSlot,
}: {
  phone: PhoneRecord
  page: PhonesPage
  testPhone: boolean
  onBigScreen: () => void
  onDelete: () => void
  /** Opens the wipe's confirm window. */
  onWipe: () => void
  onChanged: () => Promise<void>
  /** Whether control of the screen is on, said on the Control row; null while the screen is not showing. */
  control: boolean | null
  /** Where the screen draws its control switch while the Control row is open. */
  onControlSlot: (slot: HTMLDivElement | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

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
    } catch {
      showErrorToast(`This browser would not copy. The link is ${link}`)
    }
  }

  /** Asks the rack for something on the phone; the dashboard reads again, so Busy and Checking show. */
  async function ask(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function pickForSelfTest() {
    setBusy(true)
    try {
      await saveTestPhone(phone.id, phone.kind)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const flat = (node: React.ReactNode) => (
    <div className="grid min-w-0 gap-3 p-3">
      <FlatSections>{node}</FlatSections>
    </div>
  )

  return (
    // Tabs, as the profile's ⋮ and every record ⋮ in the design (Tyler, 12 Nov 2026: "Instead of toggle, put it
    // as tabs instead with settings and control as the first tab").
    <TabbedMenu
      label={`More for ${phone.name}`}
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="grid min-w-0 gap-3 p-3">
              {/* The screen draws Control's switch here while the Phone tab shows, so control is the screen's own. */}
              {control === null ? null : <div ref={onControlSlot} />}
              <PhoneSettingsSection phone={phone} page={page} onSaved={onChanged} part="rest" />
              <div>
                <ActionRow icon={<MaximizeIcon />} onClick={then(onBigScreen)}>
                  Open the bigger screen
                </ActionRow>
                {/* Asked of the phone from here (Tyler, 12 Nov 2026: "move these 2 function down here", then
                    "move these 2 function as well"); the answers land in Actions and Setup. */}
                <ActionRow icon={<SmartphoneIcon />} disabled={busy} onClick={then(() => void ask(() => runPhoneAction(phone.id, "phone/android-version")))}>
                  Read the version
                </ActionRow>
                <ActionRow icon={<HeartPulseIcon />} disabled={busy} onClick={then(() => void ask(() => runPhoneAction(phone.id, "phone/health")))}>
                  Health check
                </ActionRow>
                <ActionRow icon={<RefreshCwIcon />} disabled={busy || phone.setupChecking} onClick={then(() => void ask(() => runSetupCheck(phone.id)))}>
                  {phone.setupChecking ? "Checking the setup" : "Check the setup"}
                </ActionRow>
                <ActionRow icon={<LinkIcon />} onClick={then(() => void copyLink())}>
                  Copy link
                </ActionRow>
                {testPhone ? null : (
                  <ActionRow icon={<FlaskConicalIcon />} disabled={busy} onClick={then(() => void pickForSelfTest())}>
                    Use as the self-test phone
                  </ActionRow>
                )}
                <div aria-hidden className="-mx-3 my-1.5 border-t" />
                <ActionRow icon={<EraserIcon />} destructive onClick={then(onWipe)}>
                  Wipe the phone
                </ActionRow>
                <ActionRow icon={<Trash2Icon />} destructive onClick={then(onDelete)}>
                  Delete phone
                </ActionRow>
              </div>
            </div>
          ),
        },
        { value: "setup", label: "Setup", content: flat(<PhoneSetupPanel phone={phone} onChanged={onChanged} />) },
        { value: "actions", label: "Actions", content: flat(<PhoneActionsPanel phone={phone} onChanged={onChanged} />) },
      ]}
    />
  )
}

/**
 * The phone's box on its right panel (Tyler, 12 Nov 2026: "make the tabs as
 * if its part of the phone", drawn as a rounded box with Phone, Health and
 * Jobs underlined in a white strip along its top): the tabs, a line, then
 * what the tab picked shows, the screen's picture on Phone.
 */
function PhoneBox({ tabs, foot, children }: { tabs: React.ReactNode; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    // The box is the phone (Tyler's pick, 12 Nov 2026: "The box is the phone"): a phone's rounded corners and
    // outline, its screen under the tabs in a phone's shape on the Phone tab.
    <div className="mt-3.75 mb-3 overflow-hidden rounded-[2rem] border-[3px] border-muted-foreground/30">
      <div className="flex h-12 items-stretch border-b bg-card px-4">{tabs}</div>
      {children}
      {/* White, as the tab strip above (Tyler, 12 Nov 2026: "put the details bg to white"). */}
      {foot ? <div className="border-t bg-card">{foot}</div> : null}
    </div>
  )
}
