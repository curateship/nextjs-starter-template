import { db, type CustomShellDb } from "@/server/db"
import { emailBrandName } from "@/server/email/branding"
import { composeFromAddress } from "@/server/email/send"
import { getEmailSettings } from "@/server/email/settings"

/** Who a CRM reply goes out as. */
export type CrmReplySender = {
  /** The inbound address, which is where the answer comes back to. */
  address: string
  /** The name in front of it: the saved one, or the app name when none is. */
  name: string
  /** The whole From line, such as `Tyler <leads@inbox.example.com>`. */
  from: string
}

/** Everything about an outgoing reply that is the workspace's to decide. */
export type CrmOutgoingReply = {
  sender: CrmReplySender
  /** The lines that go under the words, or "" when none are saved. */
  signature: string
}

type EmailSettingsRow = Awaited<ReturnType<typeof getEmailSettings>>

/**
 * Works the From line out of a settings row already in hand.
 *
 * A saved name that is blank, or that is nothing but punctuation a header
 * cannot hold, falls back to the app name. A bare address reads as automated,
 * which is the opposite of a typed personal reply. `composeFromAddress` does
 * the spelling, and it is what takes a comma or a quote mark out of a typed
 * name before it can split the From header into two senders.
 */
async function senderFromSettings(
  workspaceId: string,
  settings: EmailSettingsRow,
  database: CustomShellDb
): Promise<CrmReplySender | null> {
  const address = settings?.inboundAddress ?? null
  if (!address) return null

  const typed = settings?.crmReplyName?.trim() ?? ""
  const typedFrom = composeFromAddress(typed, address)
  // `composeFromAddress` answers the bare address when nothing usable is left
  // of the name, which is both the never-filled-in case and the name that was
  // only quote marks. The app name is read only then, so the usual send never
  // asks for it.
  if (typedFrom !== address) return { address, name: typed, from: typedFrom }

  const appName = await emailBrandName(workspaceId, database)
  const from = composeFromAddress(appName, address)
  return from === address
    ? { address, name: "", from }
    : { address, name: appName, from }
}

/**
 * The sender a CRM reply goes out as, or null when the workspace has no
 * inbound address and so cannot reply at all.
 *
 * One function answers this for both the send and the footnote under the Send
 * button, so the screen cannot promise a From line the mail does not carry.
 */
export async function getCrmReplySender(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CrmReplySender | null> {
  const settings = await getEmailSettings(workspaceId, database)
  return senderFromSettings(workspaceId, settings, database)
}

/**
 * The sender and the signature together, for the send itself.
 *
 * Both live in one settings row, so sending reads that row once. The inbox
 * screen asks for the sender alone, because it draws the From line under the
 * Send button and has no use for the signature.
 */
export async function getCrmOutgoingReply(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CrmOutgoingReply | null> {
  const settings = await getEmailSettings(workspaceId, database)
  const sender = await senderFromSettings(workspaceId, settings, database)
  if (!sender) return null
  return { sender, signature: settings?.crmReplySignature?.trim() ?? "" }
}
