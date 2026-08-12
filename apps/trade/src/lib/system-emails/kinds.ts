import { z } from "zod"

import {
  createBroadcastBlock,
  type BroadcastBlock,
  type BroadcastBlockDefaults,
} from "@/lib/broadcasts/blocks"
import { escapeHtml } from "@/lib/email/escape-html"

/**
 * The emails the app sends for itself, as opposed to the newsletters somebody
 * writes.
 *
 * Registering and pressing "send it again" produce the same email from the
 * same helper, so they are one thing to edit — changing "Verify your email"
 * has to change both or the two would drift apart. An email change is the
 * opposite case and really is three: one to the new address asking it to
 * confirm, one to the old address warning it while it can still be stopped,
 * and one to the old address once it is done. They say different things to
 * different people at different moments.
 *
 * Some are alerts rather than invitations. Nobody asked for those and there is
 * nothing to complete — they exist so that somebody losing an account finds
 * out while they can still act.
 */
export const SYSTEM_EMAIL_KINDS = [
  "verify-email",
  "sign-in-link",
  "password-reset",
  "email-change",
  "email-change-warning",
  "email-change-done",
  "password-changed",
  "new-device",
  "new-account",
  "account-closed",
] as const

export type SystemEmailKind = (typeof SYSTEM_EMAIL_KINDS)[number]

/** How far back the "how busy has this been" count on the list page looks. */
export const RECENT_SEND_DAYS = 30

export const systemEmailKindSchema = z.enum(SYSTEM_EMAIL_KINDS)

export function isSystemEmailKind(value: string): value is SystemEmailKind {
  return (SYSTEM_EMAIL_KINDS as readonly string[]).includes(value)
}

/**
 * A placeholder an email can use, and what it turns into.
 *
 * `{{action_url}}` is not in here on purpose. It is not typed into the words —
 * it is where the button goes, and the button holds it whether anybody knows
 * about it or not.
 */
export type SystemEmailToken = { token: string; description: string }

const EMAIL_TOKEN: SystemEmailToken = {
  token: "{{email}}",
  description: "The address the email is going to",
}

/**
 * The two an alert needs to be worth reading. "It happened" is not actionable;
 * "it happened at 2am from a Windows PC" is what tells somebody it was not
 * them. The time is always written in UTC and says so, because an email has no
 * way to know the reader's clock.
 */
const WHEN_TOKEN: SystemEmailToken = {
  token: "{{when}}",
  description: "When it happened, in UTC",
}

const DEVICE_TOKEN: SystemEmailToken = {
  token: "{{device}}",
  description: 'The browser and system it came from, like "Chrome on macOS"',
}

export type SystemEmailMeta = {
  kind: SystemEmailKind
  /** What it is called in the list and at the top of the editor. */
  name: string
  /** When it goes out, in the words of whoever receives it. */
  whenSent: string
  /** The words it starts with — today's email, exactly. */
  defaults: {
    subject: string
    heading: string
    message: string
    action: string
    /**
     * The small print at the bottom. Almost every one of these is something
     * the person asked for thirty seconds ago, so the line tells them they can
     * ignore it. A warning email is the exception and says the opposite, which
     * is why this is per email rather than one line in the renderer.
     */
    closing: string
  }
  tokens: SystemEmailToken[]
}

/** What the small print says on an email somebody asked for themselves. */
const IGNORE_LINE = "If you did not request this, you can ignore this email."

export const SYSTEM_EMAIL_META: Record<SystemEmailKind, SystemEmailMeta> = {
  "verify-email": {
    kind: "verify-email",
    name: "Verify your email",
    whenSent:
      "When somebody registers, and again whenever they ask for another one.",
    defaults: {
      subject: "Verify your email",
      heading: "Confirm your email address",
      message: "Verify your email to finish setting up your account.",
      action: "Verify email",
      closing: IGNORE_LINE,
    },
    tokens: [EMAIL_TOKEN],
  },
  "sign-in-link": {
    kind: "sign-in-link",
    name: "Your sign-in link",
    whenSent: "When somebody asks to sign in with a link instead of a password.",
    defaults: {
      subject: "Your sign-in link",
      heading: "Sign in",
      message:
        "This link signs you in once and expires in {{minutes}} minutes.",
      action: "Sign in",
      closing: IGNORE_LINE,
    },
    tokens: [
      EMAIL_TOKEN,
      {
        token: "{{minutes}}",
        description: "How many minutes the link lasts",
      },
    ],
  },
  "password-reset": {
    kind: "password-reset",
    name: "Reset your password",
    whenSent: "When somebody presses “I forgot my password”.",
    defaults: {
      subject: "Reset your password",
      heading: "Reset your password",
      message: "This link expires in one hour.",
      action: "Reset password",
      closing: IGNORE_LINE,
    },
    tokens: [EMAIL_TOKEN],
  },
  "email-change": {
    kind: "email-change",
    name: "Confirm a new email address",
    whenSent:
      "When somebody changes the address on their account. It goes to the new address, not the old one.",
    defaults: {
      subject: "Confirm your new email address",
      heading: "Confirm your new email address",
      message:
        "Opening this link moves the account at {{old_email}} to this address. It expires in {{hours}} hours.",
      action: "Confirm email address",
      closing: IGNORE_LINE,
    },
    tokens: [
      EMAIL_TOKEN,
      {
        token: "{{old_email}}",
        description: "The address the account is moving away from",
      },
      { token: "{{hours}}", description: "How many hours the link lasts" },
    ],
  },
  "email-change-warning": {
    kind: "email-change-warning",
    name: "Warning: your address is being changed",
    whenSent:
      "When somebody asks to move their account to a new address. It goes to the old address, and carries the link that stops it.",
    defaults: {
      subject: "Your email address is being changed",
      heading: "Is this you?",
      message:
        "Somebody asked to move this account to {{new_email}}. Nothing has changed yet — it only moves once that address confirms it, and the request expires in {{hours}} hours. If that was you, there is nothing to do.",
      action: "This wasn't me",
      closing:
        "If this was not you, use the button. It cancels the change and signs every browser out of the account, so you can reset your password and take it back.",
    },
    tokens: [
      EMAIL_TOKEN,
      {
        token: "{{new_email}}",
        description: "The address the account would be moving to",
      },
      { token: "{{hours}}", description: "How many hours the request lasts" },
    ],
  },
  "email-change-done": {
    kind: "email-change-done",
    name: "Your address has been changed",
    whenSent:
      "When an email change is confirmed. It goes to the address the account just left, which will not hear from the app again.",
    defaults: {
      subject: "Your email address has been changed",
      heading: "This account has moved",
      message:
        "The account that used this address now uses {{new_email}}, as of {{when}}. Signing in with this address will no longer work.",
      action: "Open the app",
      closing:
        "If you did not do this, contact support from this address straight away — they can see where the account went and move it back.",
    },
    tokens: [
      EMAIL_TOKEN,
      {
        token: "{{new_email}}",
        description: "The address the account moved to",
      },
      WHEN_TOKEN,
    ],
  },
  "password-changed": {
    kind: "password-changed",
    name: "Your password was changed",
    whenSent:
      "When somebody changes their password, and when they finish a password reset.",
    defaults: {
      subject: "Your password was changed",
      heading: "Your password was changed",
      message:
        "This happened on {{when}}, from {{device}}. Every other browser signed in to the account was signed out.",
      action: "Reset your password",
      closing:
        "If this was not you, reset your password now — that is the fastest way to lock whoever did it out.",
    },
    tokens: [EMAIL_TOKEN, WHEN_TOKEN, DEVICE_TOKEN],
  },
  "new-device": {
    kind: "new-device",
    name: "A new device signed in",
    whenSent:
      "The first time an account is signed in to from a given browser and system. Signing in again from the same one sends nothing.",
    defaults: {
      subject: "A new device signed in to your account",
      heading: "A new device signed in",
      message:
        "Somebody signed in to your account from {{device}} on {{when}}. If that was you, there is nothing to do.",
      action: "Reset your password",
      closing:
        "If it was not you, reset your password now, then sign the other browsers out under Account → Security.",
    },
    tokens: [EMAIL_TOKEN, DEVICE_TOKEN, WHEN_TOKEN],
  },
  "new-account": {
    kind: "new-account",
    name: "An account was made for you",
    whenSent: "When an admin creates somebody's account for them.",
    defaults: {
      subject: "Set your password",
      heading: "An account was created for you",
      message:
        "Set a password to start using it. This link expires in one hour — if it has, use “Forgot your password?” on the sign-in page to get a fresh one.",
      action: "Set your password",
      closing: IGNORE_LINE,
    },
    tokens: [EMAIL_TOKEN],
  },
  "account-closed": {
    kind: "account-closed",
    name: "Account closed",
    whenSent: "When somebody closes an account, or an admin closes it for them.",
    defaults: {
      subject: "Your account has been closed",
      heading: "Your account is closed",
      message:
        "The account for {{email}} will be deleted for good on {{deletion_date}}. {{plan_status}} {{restore_instructions}}",
      action: "Open the app",
      closing:
        "After {{deletion_date}}, the account cannot be restored.",
    },
    tokens: [
      EMAIL_TOKEN,
      {
        token: "{{deletion_date}}",
        description: "The date the account is deleted for good",
      },
      {
        token: "{{plan_status}}",
        description: "Whether a paid plan was cancelled immediately",
      },
      {
        token: "{{restore_instructions}}",
        description: "How this person can restore the account",
      },
    ],
  },
}

/**
 * The blocks an email starts with: today's wording, laid out as blocks.
 *
 * One pattern for every email the app sends: the header, a heading and the
 * sentence, the button in the middle, the closing line, then the footer. The
 * saved per-workspace block setups fill the header's logo and the footer's
 * company lines in, so a new email opens already looking like the rest. Two
 * things the pattern pins regardless of any saved setup: the button sits in
 * the middle, and the footer's unsubscribe link is off. These are account
 * messages rather than newsletters, so there is no unsubscribe address to
 * fill in.
 */
export function createSystemEmailBlocks(
  kind: SystemEmailKind,
  blockDefaults: BroadcastBlockDefaults = {}
) {
  const { defaults } = SYSTEM_EMAIL_META[kind]
  const header = createBroadcastBlock("header", blockDefaults)
  const copy = createBroadcastBlock("richText", blockDefaults)
  const button = createBroadcastBlock("button", blockDefaults)
  const closing = createBroadcastBlock("richText", blockDefaults)
  const footer = createBroadcastBlock("footer", blockDefaults)

  const blocks: BroadcastBlock[] = [
    header,
    {
      ...copy,
      kind: "richText",
      content: {
        ...(copy.content as Extract<
          BroadcastBlock,
          { kind: "richText" }
        >["content"]),
        htmlContent: `<h1>${escapeHtml(defaults.heading)}</h1><p>${escapeHtml(
          defaults.message
        )}</p>`,
      },
    },
    {
      ...button,
      kind: "button",
      content: {
        ...(button.content as Extract<
          BroadcastBlock,
          { kind: "button" }
        >["content"]),
        label: defaults.action,
        // Blank on purpose: the send fills in the one-use link.
        url: "",
        padding: 0,
        alignment: "center",
      },
    },
    {
      ...closing,
      kind: "richText",
      content: {
        ...(closing.content as Extract<
          BroadcastBlock,
          { kind: "richText" }
        >["content"]),
        htmlContent: `<p>${escapeHtml(defaults.closing)}</p>`,
      },
    },
    {
      ...footer,
      kind: "footer",
      content: {
        ...(footer.content as Extract<
          BroadcastBlock,
          { kind: "footer" }
        >["content"]),
        showUnsubscribe: false,
      },
    },
  ]

  return blocks
}

/**
 * Fills a system email's placeholders in.
 *
 * Same rules as the newsletter's `personalizeEmail`: values going into HTML are
 * escaped, values going into a subject line are not, because a subject is not
 * markup. A placeholder with no value for this email is replaced with nothing
 * rather than left showing its own braces.
 */
export function applySystemEmailTokens(
  template: string,
  values: Record<string, string>,
  options: { html: boolean }
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) return ""
    return options.html ? escapeHtml(value) : value
  })
}
