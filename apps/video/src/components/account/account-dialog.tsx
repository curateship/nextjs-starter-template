import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon, SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccountProfilePage } from "@/components/account/account-profile-page"
import { AccountBillingPage } from "@/components/account/account-billing-page"
import { AccountSecurityPage } from "@/components/account/account-security-page"
import type { AuthUser } from "@/lib/api/auth/auth"
import {
  getBillingErrorMessage,
  loadBillingPage,
  type BillingInvoice,
  type BillingOverview,
  type CardExpiryWarning,
  type PlanSummary,
} from "@/lib/api/billing/billing"

export const ACCOUNT_TABS = ["profile", "billing", "security"] as const
export type AccountTab = (typeof ACCOUNT_TABS)[number]

const TAB_LABELS: Record<AccountTab, string> = {
  profile: "Profile",
  billing: "Billing",
  security: "Security",
}

export function isAccountTab(value: unknown): value is AccountTab {
  return ACCOUNT_TABS.includes(value as AccountTab)
}

/**
 * The sidebar's "Account" section (and any saved user config) still points at
 * the retired `/account*` paths. Map those to a tab so the click opens this
 * modal instead of navigating — no config migration needed.
 */
export function accountTabForHref(href: string): AccountTab | null {
  switch (href) {
    case "/account":
      return "profile"
    case "/account/billing":
      return "billing"
    case "/account/security":
      return "security"
    default:
      return null
  }
}

/** Open the account modal on the current page by setting `?account=<tab>`. */
export function useOpenAccount() {
  const navigate = useNavigate()
  return React.useCallback(
    (tab: AccountTab) => {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, account: tab }),
      })
    },
    [navigate]
  )
}

export function AccountDialog({
  tab,
  user,
  plan,
  onTabChange,
  onClose,
  onProfileSaved,
}: {
  tab: AccountTab | null
  user: AuthUser
  plan: PlanSummary
  onTabChange: (tab: AccountTab) => void
  onClose: () => void
  onProfileSaved: () => void
}) {
  const [profileStatus, setProfileStatus] = React.useState({
    saving: false,
    saved: false,
    dirty: false,
  })
  // The window keeps showing the tab it was on the whole way out.
  //
  // `tab` comes from the URL and is gone the instant `?account=` is dropped,
  // but the window is still on screen for the length of its fade. Rendering
  // straight from `tab` hid the body, unmounted the panel and dropped the
  // footer at that moment, so the window visibly collapsed to a small empty
  // header before it disappeared. Only whether it is open reads `tab` now.
  const [shownTab, setShownTab] = React.useState<AccountTab>(tab ?? "profile")
  if (tab && tab !== shownTab) {
    setShownTab(tab)
  }

  return (
    // Only the Profile tab holds a form. Its unsaved name or photo is asked
    // about before the X, the overlay or Escape can drop it, and a save in
    // flight holds the window open. Profile stays mounted while the window is
    // open (see the panel below), so the question follows the edits from
    // whichever tab is on show rather than only from Profile.
    <FormDialog
      open={tab != null}
      dirty={profileStatus.dirty}
      busy={profileStatus.saving}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent
          variant="admin"
          // One fixed height for all three tabs. Each tab's content is a
          // different length, and a window sized by its content re-centres
          // itself on every switch — the whole thing visibly jumped up and
          // down. The admin variant's max-height still caps this on short
          // screens, and the body scrolls inside the frame either way.
          className="h-[54rem] sm:max-w-3xl"
          aria-describedby={undefined}
        >
          <Tabs
            value={shownTab}
            onValueChange={(value) => onTabChange(value as AccountTab)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <DialogTitle>Account</DialogTitle>
                <TabsList>
                  {ACCOUNT_TABS.map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {TAB_LABELS[id]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </DialogHeader>

            <DialogBody>
              {/* A tab panel is a cell of the body's grid, so without `min-w-0`
                  it is as wide as its widest child — one long invoice number or
                  device name would then stretch every card in the window past
                  the edge of a phone screen. With it, a wide table stays inside
                  its own surface and scrolls sideways there. */}
              {/* Profile is the one panel that holds typed work, so it stays
                  mounted for the life of the window — a trip to Billing and
                  back leaves a half-typed name exactly where it was. Radix
                  leaves a force-mounted panel visible, so `hidden` is ours to
                  set. Billing and Security are left to mount on demand: they
                  fetch on open, and mounting them here would make every visit
                  to this window pull billing and device data nobody asked for. */}
              <TabsContent
                value="profile"
                className="min-w-0"
                forceMount
                hidden={shownTab !== "profile"}
              >
                <AccountProfilePage
                  user={user}
                  planName={plan.planName}
                  isPaid={plan.isPaid}
                  formId={PROFILE_FORM_ID}
                  onSaved={onProfileSaved}
                  onManageBilling={() => onTabChange("billing")}
                  onStatusChange={setProfileStatus}
                />
              </TabsContent>
              <TabsContent value="billing" className="min-w-0">
                <BillingTab />
              </TabsContent>
              <TabsContent value="security" className="min-w-0">
                <AccountSecurityPage user={user} isPaid={plan.isPaid} />
              </TabsContent>
            </DialogBody>

            {/* Both footers are keyed. Without it React keeps the one button's
                DOM node and rewrites it — the black "Done" becomes "Cancel" in
                place, and `Button`'s own 150ms transition then animates it from
                black to white, so Cancel flashed dark on every tab switch. */}
            {shownTab === "profile" ? (
              // The "Saved" note takes the hard-left slot this window has no
              // Delete for, so Cancel and the primary stay where they are in
              // every other window.
              <DialogFooter key="profile">
                {profileStatus.saved ? (
                  <span className="mr-auto text-sm text-muted-foreground">
                    Saved
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={profileStatus.saving}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form={PROFILE_FORM_ID}
                  disabled={profileStatus.saving || !profileStatus.dirty}
                >
                  {profileStatus.saving ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SaveIcon className="size-4" />
                  )}
                  Save changes
                </Button>
              </DialogFooter>
            ) : (
              // Billing and Security save nothing of their own — every action on
              // them applies as it is clicked. So they end with a single "Done"
              // and no Cancel, and it leaves by the same path as the X so a
              // half-typed Profile is still asked about.
              <DialogFooter key="done">
                <Button
                  type="button"
                  disabled={profileStatus.saving}
                  onClick={requestClose}
                >
                  Done
                </Button>
              </DialogFooter>
            )}
          </Tabs>
        </DialogContent>
      )}
    </FormDialog>
  )
}

const PROFILE_FORM_ID = "account-profile-form"

type BillingTabData = {
  overview: BillingOverview
  invoices: BillingInvoice[]
  cardWarning: CardExpiryWarning | null
}

/**
 * What the last load returned, kept for as long as the page is open.
 *
 * This tab unmounts when you leave it, so without this a trip to Profile and
 * back emptied the panel and then filled it again — everything on the tab
 * jumped as the cards came back. A fresh load still runs on every visit.
 *
 * Only ever written from the browser (the load happens in an effect), so this
 * cannot carry one person's billing into another's page on the server.
 */
let lastBilling: BillingTabData | null = null

/** Billing data isn't in the shell, so fetch it when the tab first mounts. */
function BillingTab() {
  const [data, setData] = React.useState<BillingTabData | null>(lastBilling)
  const [error, setError] = React.useState<string | null>(null)
  // Bumped by "Try again", which re-runs the same load rather than making the
  // reader close the window and come back.
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    loadBillingPage()
      .then((result) => {
        lastBilling = result
        if (!cancelled) setData(result)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getBillingErrorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  // Only when there is nothing else to show. Once `lastBilling` is filled, a
  // refresh that fails leaves the cards from last time standing rather than
  // replacing a working page with a banner.
  if (error && !data) {
    return (
      <ErrorBanner
        message={error}
        // Clearing the message here rather than in the effect: the loading
        // state is what should show while the second attempt is in the air.
        onRetry={() => {
          setError(null)
          setReloads((count) => count + 1)
        }}
      />
    )
  }

  // Only on the very first visit of the page's life, since `lastBilling` covers
  // every one after it. Nothing is drawn rather than a stand-in: the placeholder
  // that used to sit here read as a flash of its own.
  if (!data) {
    return null
  }

  return (
    <AccountBillingPage
      overview={data.overview}
      invoices={data.invoices}
      cardWarning={data.cardWarning}
      // Pausing changes the plan, the badges and the buttons all at once, so
      // the tab re-reads itself rather than trying to patch what it is showing.
      onChanged={() => setReloads((count) => count + 1)}
    />
  )
}
