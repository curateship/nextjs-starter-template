import { PHONE_STATUS_WORDS, slotWords, type PhoneStatus } from "@/lib/phones/options"
import { STATUS_DOT } from "@/lib/phones/status-dot"

/**
 * A phone's status in words, with why it is offline and, for a phone that
 * needs a hand, the shelf slot to pick it up from.
 */
export function PhoneStatusText({
  phone,
}: {
  phone: { status: PhoneStatus; offlineReason: string; shelfSlot: string; inUse?: boolean }
}) {
  const slot = phone.status === "offline" ? slotWords(phone.shelfSlot) : ""
  return (
    <span className="grid">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
        {PHONE_STATUS_WORDS[phone.status]}
        {slot ? <span className="font-medium">· {slot}</span> : null}
      </span>
      {phone.offlineReason ? <span className="text-xs text-muted-foreground">{phone.offlineReason}</span> : null}
      {phone.status === "held" && phone.inUse ? (
        <span className="text-xs text-muted-foreground">In use on its screen</span>
      ) : null}
    </span>
  )
}
