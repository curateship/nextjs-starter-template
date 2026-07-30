import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccountProfilePage } from "@/components/account-profile-page"
import {
  AccountBillingPage,
  BillingTabSkeleton,
} from "@/components/account-billing-page"
import { AccountSecurityPage } from "@/components/account-security-page"
import type { AuthUser } from "@/lib/api/auth"
import {
  getBillingErrorMessage,
  loadBillingPage,
  type BillingInvoice,
  type BillingOverview,
  type PlanSummary,
} from "@/lib/api/billing"

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
  })

  return (
    <Dialog
      open={tab != null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        variant="admin"
        className="sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <Tabs
          value={tab ?? "profile"}
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
            <TabsContent value="profile">
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
            <TabsContent value="billing">
              <BillingTab />
            </TabsContent>
            <TabsContent value="security">
              <AccountSecurityPage />
            </TabsContent>
          </DialogBody>

          {tab === "profile" ? (
            <DialogFooter>
              {profileStatus.saved ? (
                <span className="mr-auto text-sm text-muted-foreground">
                  Saved
                </span>
              ) : null}
              <Button
                type="submit"
                form={PROFILE_FORM_ID}
                disabled={profileStatus.saving}
              >
                <SaveIcon className="size-4" />
                Save
              </Button>
            </DialogFooter>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const PROFILE_FORM_ID = "account-profile-form"

/** Billing data isn't in the shell, so fetch it when the tab first mounts. */
function BillingTab() {
  const [data, setData] = React.useState<{
    overview: BillingOverview
    invoices: BillingInvoice[]
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    loadBillingPage()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getBillingErrorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <ErrorBanner message={error} />
  }

  if (!data) {
    return <BillingTabSkeleton />
  }

  return <AccountBillingPage overview={data.overview} invoices={data.invoices} />
}
