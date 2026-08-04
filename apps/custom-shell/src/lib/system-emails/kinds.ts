import { z } from "zod"

import {
  createBroadcastBlock,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { escapeHtml } from "@/lib/escape-html"

/**
 * The emails the app sends for itself, as opposed to the newsletters somebody
 * writes.
 *
 * Five, not six. Registering and pressing "send it again" produce the same
 * email from the same helper, so they are one thing to edit — changing "Verify
 * your email" has to change both or the two would drift apart.
 */
export const SYSTEM_EMAIL_KINDS = [
  "verify-email",
  "sign-in-link",
  "password-reset",
  "email-change",
  "new-account",
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
  }
  tokens: SystemEmailToken[]
}

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
    },
    tokens: [EMAIL_TOKEN],
  },
}

/** The line at the bottom of every one of these, which nobody passes in. */
const CLOSING_LINE = "If you did not request this, you can ignore this email."

/**
 * The blocks an email starts with: today's wording, laid out as blocks.
 *
 * A heading and the sentence, the button, then the closing line. No logo,
 * because none is set up, and no footer — an unsubscribe link has no business
 * on an email somebody asked for by pressing a button thirty seconds ago.
 */
export function createSystemEmailBlocks(kind: SystemEmailKind) {
  const { defaults } = SYSTEM_EMAIL_META[kind]
  const copy = createBroadcastBlock("richText")
  const button = createBroadcastBlock("button")
  const closing = createBroadcastBlock("richText")

  const blocks: BroadcastBlock[] = [
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
        htmlContent: `<p>${escapeHtml(CLOSING_LINE)}</p>`,
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
