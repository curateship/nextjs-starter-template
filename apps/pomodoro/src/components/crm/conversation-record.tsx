import * as React from "react"
import { toast } from "sonner"

import { ConversationPanel } from "@/components/crm/conversation-panel"
import { blockAddress, getBlockedSenderErrorMessage } from "@/lib/api/crm/blocked"
import {
  draftReply,
  fetchMessageBody,
  getCrmErrorMessage,
  loadConversation,
  markConversationRead,
  markConversationUnread,
  setConversationSaved,
  setConversationStatus,
  summariseConversation,
  type Conversation,
} from "@/lib/api/crm/inbox"
import { loadLead, type LeadBundle } from "@/lib/api/crm/leads"
import type { ReplyDraftUpdate } from "@/lib/crm/reply-drafts"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Blocks an address, and closes its conversation.
 *
 * Two writes, reported separately. The block goes first because it is the
 * half that matters, and a close that then fails is said out loud rather
 * than folded into one message: "nothing worked" when the address is in fact
 * blocked would send somebody to Settings looking for a row that is there.
 * `onDone` runs after either outcome, to draw the change.
 */
export async function blockAndCloseThread(threadId: string, address: string, onDone: () => void) {
  try {
    await blockAddress(address, "Blocked from the conversation")
  } catch (error) {
    showErrorToast(getBlockedSenderErrorMessage(error))
    return
  }

  try {
    await setConversationStatus(threadId, "closed")
  } catch {
    showErrorToast(`Mail from ${address} is blocked, but this conversation did not close. Press Close to shut it.`)
    onDone()
    return
  }

  toast.success(`Mail from ${address} will not reach the inbox. Settings → Email unblocks it.`)
  onDone()
}

/**
 * One conversation on the right, read and answered in place: the Inbox's
 * right panel, and a lead's on the People tab (Tyler, 9 Nov 2026: "If there's
 * a conversation, why not just put the conversation there instead of a
 * button?"). It reads the conversation and who it is with, marks it read,
 * and holds what pressing anything in `ConversationPanel` does, so both
 * places behave the same.
 *
 * What it does not own: the half-written reply, which the screen keeps so it
 * survives switching conversations (`replyDraft`), and the list beside it,
 * which `onListChanged` asks the screen to read again. `reloadToken` reads
 * the conversation again from outside, as the live inbox does when it gets a
 * new message.
 */
export function ConversationRecord({
  threadId,
  fallbackName,
  fallbackEmail,
  emptyLine,
  replyFromFallback,
  replyDraft,
  onReplyDraftChange,
  reloadToken = 0,
  onListChanged,
  onOpenContact,
}: {
  /** The conversation open, or null when none is. */
  threadId: string | null
  /** Who it is with, from the list's row, until the lead's own read lands. */
  fallbackName: string | null
  fallbackEmail: string | null
  /** Said when nothing can open because the list is empty; null otherwise. */
  emptyLine: string | null
  /** The From line a reply carries when the conversation does not say. */
  replyFromFallback: string | null
  replyDraft: string
  onReplyDraftChange: (threadId: string, update: ReplyDraftUpdate) => void
  reloadToken?: number
  /** The list beside it is read again after a change made here. */
  onListChanged: () => void
  /** Opens the person's contact, for a lead already on the mailing list. */
  onOpenContact?: (contactId: string) => void
}) {
  const [loaded, setLoaded] = React.useState<{
    conversation: Conversation
    lead: LeadBundle | null
  } | null>(null)
  // Bumped to pull the conversation and the lead down again after a change.
  const [reloads, setReloads] = React.useState(0)
  // Which request has finished, which is what "still loading" is worked out
  // from. Stamped when the fetch settles rather than flipped on at the start:
  // turning a flag on inside an effect body is a second render for nothing,
  // and `react-hooks/set-state-in-effect` refuses it. The same shape as
  // `SystemEmailSendsPanel`.
  const requestKey = threadId ? `${threadId}:${reloads}:${reloadToken}` : null
  const [settledRequest, setSettledRequest] = React.useState<string | null>(null)
  const loadingThread = requestKey !== null && settledRequest !== requestKey

  // Which conversation is shown is worked out from what is asked for, not
  // stored. Keeping it in state meant clearing that state whenever the
  // address said "none", which is a write inside an effect and one paint of
  // the wrong conversation.
  const conversation = loaded && loaded.conversation.id === threadId ? loaded.conversation : null
  const lead = conversation ? (loaded?.lead ?? null) : null

  // Held in a ref so the fetch below is keyed on which conversation is open,
  // not on a callback the owner rebuilds every render. In the deps it would
  // re-run the whole fetch on any parent redraw.
  const listChangedRef = React.useRef(onListChanged)
  React.useEffect(() => {
    listChangedRef.current = onListChanged
  })

  React.useEffect(() => {
    if (!threadId) return

    let cancelled = false
    loadConversation(threadId)
      .then(async (opened) => {
        if (cancelled) return
        // The conversation lands first so it can be read while the lead is
        // still coming. The same conversation read again keeps the lead it
        // had meanwhile: dropping it would empty the ⋮ under a box somebody
        // is typing in, every time a field saves.
        setLoaded((previous) => ({
          conversation: opened,
          lead: previous?.conversation.id === opened.id ? previous.lead : null,
        }))

        // Opening it is reading it, and that is a write, so it goes out as its
        // own checked request once the thread is actually on screen. The list
        // is asked again afterwards, which is what takes the bold off the row.
        if (opened.unread) {
          await markConversationRead(opened.id).catch(() => undefined)
          if (!cancelled) listChangedRef.current()
        }

        const bundle = await loadLead(opened.leadId)
        if (!cancelled) setLoaded({ conversation: opened, lead: bundle })
      })
      .catch((error) => {
        if (cancelled) return
        showErrorToast(getCrmErrorMessage(error))
        setLoaded(null)
      })
      .finally(() => {
        if (!cancelled) setSettledRequest(requestKey)
      })

    return () => {
      cancelled = true
    }
  }, [threadId, requestKey])

  const reloadThread = () => setReloads((count) => count + 1)
  const reloadBoth = () => {
    reloadThread()
    onListChanged()
  }

  const blockSender = async () => {
    const address = lead?.lead.email ?? fallbackEmail
    if (!conversation || !address) return
    await blockAndCloseThread(conversation.id, address, reloadBoth)
  }

  const refetchBody = async (messageId: string) => {
    if (!conversation) return
    try {
      await fetchMessageBody(conversation.id, messageId)
      reloadThread()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
  }

  return (
    <ConversationPanel
      conversation={conversation}
      lead={lead?.lead ?? null}
      siteTags={lead?.siteTags ?? []}
      leadName={lead?.lead.name ?? fallbackName}
      leadEmail={lead?.lead.email ?? fallbackEmail}
      loading={loadingThread}
      emptyLine={emptyLine}
      canSend={conversation !== null}
      replyFrom={conversation?.replyFrom ?? replyFromFallback}
      replyDraft={replyDraft}
      onReplyDraftChange={onReplyDraftChange}
      onSavedChange={async (saved) => {
        if (!conversation) return
        try {
          await setConversationSaved(conversation.id, saved)
          toast.success(saved ? "Saved." : "Taken out of Saved.")
          reloadBoth()
        } catch (error) {
          showErrorToast(getCrmErrorMessage(error))
        }
      }}
      onMarkUnread={async () => {
        if (!conversation) return
        try {
          await markConversationUnread(conversation.id)
          // The list, not the conversation: the thread on screen is unchanged
          // and reloading it would stamp it read again the moment it came back.
          onListChanged()
        } catch (error) {
          showErrorToast(getCrmErrorMessage(error))
        }
      }}
      onSummarise={async () => {
        if (!conversation) return
        try {
          await summariseConversation(conversation.id)
          reloadThread()
        } catch (error) {
          showErrorToast(getCrmErrorMessage(error))
        }
      }}
      onBlockSender={blockSender}
      onLeadChanged={reloadBoth}
      onFetchBody={refetchBody}
      onSent={reloadBoth}
      onDraft={async () => {
        if (!conversation) return ""
        const { draft } = await draftReply(conversation.id)
        return draft
      }}
      onOpenContact={onOpenContact}
    />
  )
}
