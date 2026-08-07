import type {
  EmailDeliveryStatus,
  EmailSettingsStatus,
} from "@/lib/api/email/email-settings"

/**
 * How the app says whether it can send email, in one place.
 *
 * Two screens ask the same question — the Email settings tab and the urgent
 * rows at the top of the admin Overview's Activity card — and they must not
 * answer it differently. The rules live here so the wording and the cut-off
 * are shared.
 */

/** True while there is no usable key anywhere, so nothing can go out. */
export function emailIsOff(delivery: EmailDeliveryStatus) {
  return delivery.source === null
}

/**
 * What stops working while there is no key, honest about which server this is.
 *
 * A live server refuses the send, which is what makes a sign-up fail. Anywhere
 * else the link goes to the server log instead, so local sign-up still works
 * end to end — saying it is broken there would just teach people to ignore it.
 */
export function emailOffConsequence(delivery: EmailDeliveryStatus) {
  return delivery.failsWithoutKey
    ? "Nobody can sign up, reset a password or get a sign-in link until a key is saved."
    : "Sign-in and reset links are only written to the server log. On the live site they would fail instead."
}

/** The one line the Email settings tab leads with. */
export function emailStatusLine(status: EmailSettingsStatus): {
  on: boolean
  line: string
} {
  if (emailIsOff(status.delivery)) {
    return { on: false, line: `Email is off. ${emailOffConsequence(status.delivery)}` }
  }

  // Not "everything this app sends": where a second workspace saved a key more
  // recently, the app's own sign-in and reset mails take that one instead. What
  // is always true of a key saved here is that this workspace sends with it.
  if (status.keyConfigured) {
    return {
      on: true,
      line: "Email is on. This workspace's emails go out through the key saved here.",
    }
  }

  // A key elsewhere covers the app's own emails — sign-in links, password
  // resets — but never this workspace's newsletters, which send from the
  // address and key on this tab. Worth saying, or an empty tab that reads
  // "email is on" is a trap.
  return status.delivery.source === "environment"
    ? {
        on: true,
        line: "Email is on, using the key set on the server itself rather than one saved here. Sign-in links and password resets work; this workspace's newsletters need a key on this tab.",
      }
    : {
        on: true,
        line: "Email is on, using a key saved on another workspace's Email tab. Sign-in links and password resets work; this workspace's newsletters need a key on this tab.",
      }
}
