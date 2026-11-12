import * as React from "react"

import {
  describeAccountDeletion,
  type AccountTarget,
} from "@/components/admin-dashboard/account-words"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { isPendingDeletion } from "@/lib/account-deletion"
import {
  deleteAccountAsAdmin,
  getAdminUserErrorMessage,
  restoreAccountsAsAdmin,
} from "@/lib/api/people/admin-users"
import { getViewAsErrorMessage, startViewingAsMember } from "@/lib/api/people/view-as"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { showErrorToast } from "@/lib/toast/error-toast"

/** One account's Delete, Restore or View as member, waiting on its confirmation. */
export type AccountAsk = { kind: "delete" | "restore" | "viewAs"; account: AccountTarget }

/**
 * The three questions asked before something is done to one account. A row's
 * bin, its right-click menu and the person's ⋮ on the right all ask through
 * these, so each question reads the same wherever it was asked from.
 *
 * `onDone` hears what happened once it has: `goneForGood` when a delete
 * removed the account rather than scheduling it.
 */
export function AccountActionDialogs({
  ask,
  onClose,
  onDone,
}: {
  ask: AccountAsk | null
  onClose: () => void
  onDone: (done: { kind: "delete" | "restore"; accountId: string; goneForGood: boolean }) => Promise<void>
}) {
  const shown = useLastValue(ask)
  const [run, busy] = useAsyncAction(getAdminUserErrorMessage)
  const [startingViewAs, setStartingViewAs] = React.useState(false)
  const account = shown?.account ?? null

  const close = (open: boolean) => {
    if (!open) onClose()
  }

  const remove = () => {
    if (!ask) return
    const target = ask.account
    void run(async () => {
      const result = await deleteAccountAsAdmin(target.id)
      onClose()
      await onDone({ kind: "delete", accountId: target.id, goneForGood: result.deleted > 0 })
    })
  }

  const restore = () => {
    if (!ask) return
    const target = ask.account
    void run(async () => {
      await restoreAccountsAsAdmin([target.id])
      onClose()
      await onDone({ kind: "restore", accountId: target.id, goneForGood: false })
    })
  }

  const viewAs = async () => {
    if (!ask) return
    setStartingViewAs(true)
    try {
      await startViewingAsMember(ask.account.id)
      // A full load, not a router refresh: every loader on this page was
      // fetched as an admin and none of it is theirs to see now.
      window.location.href = "/home"
    } catch (error) {
      setStartingViewAs(false)
      showErrorToast(getViewAsErrorMessage(error))
    }
  }

  return (
    <>
      <ConfirmDialog
        open={ask?.kind === "delete"}
        onOpenChange={close}
        title={account && isPendingDeletion(account) ? "Delete this account for good?" : "Delete this account?"}
        description={account ? describeAccountDeletion(account) : null}
        confirmLabel="Delete account"
        loading={busy}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={ask?.kind === "restore"}
        onOpenChange={close}
        title="Restore this account?"
        description={
          account
            ? `${account.name} (${account.email}) becomes active again and can sign in. Nothing was deleted, so everything they own comes back with them. They will be told by email and in the app.`
            : null
        }
        confirmLabel="Restore account"
        destructive={false}
        loading={busy}
        onConfirm={restore}
      />
      <ConfirmDialog
        open={ask?.kind === "viewAs"}
        onOpenChange={close}
        title="View the app as this member?"
        description={
          account
            ? `You will see exactly what ${account.name} sees, and anything you do will be done as them. You lose your admin pages until you stop. Starting and stopping are both recorded in the activity log.`
            : null
        }
        confirmLabel="View as member"
        destructive={false}
        loading={startingViewAs}
        onConfirm={() => void viewAs()}
      />
    </>
  )
}
