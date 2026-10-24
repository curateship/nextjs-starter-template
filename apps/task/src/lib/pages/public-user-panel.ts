import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"

/**
 * The account corner of the public header, set up the way the directory app
 * sets up its User Panel.
 *
 * A signed-out visitor sees two buttons, Sign in and Register. Each has its
 * own name, address, icon and button style, and each chooses whether a phone
 * lists it under the round account button. A signed-in visitor sees their
 * photo instead, and the links saved here sit at the top of the menu it opens,
 * above the shell's own Dashboard, Admin and Log out.
 *
 * The defaults are the words and addresses the header always had, so a site
 * that never opens this window looks exactly as it did before.
 */

export const PUBLIC_USER_PANEL_BUTTON_STYLES = [
  "primary",
  "outline",
  "ghost",
] as const
export type PublicUserPanelButtonStyle =
  (typeof PUBLIC_USER_PANEL_BUTTON_STYLES)[number]

export const PUBLIC_USER_PANEL_BUTTON_STYLE_LABELS: Record<
  PublicUserPanelButtonStyle,
  string
> = {
  primary: "Primary",
  outline: "Outline",
  ghost: "Ghost",
}

export const PUBLIC_USER_PANEL_BUTTON_KEYS = ["login", "register"] as const
export type PublicUserPanelButtonKey =
  (typeof PUBLIC_USER_PANEL_BUTTON_KEYS)[number]

export const MAX_PUBLIC_USER_PANEL_LINKS = 20
export const MAX_PUBLIC_USER_PANEL_LABEL_LENGTH = 120
export const MAX_PUBLIC_USER_PANEL_HREF_LENGTH = 2_048
const MAX_ICON_LENGTH = 2_048

export type PublicUserPanelButton = {
  label: string
  /** Blank hides the button everywhere. */
  href: string
  style: PublicUserPanelButtonStyle
  /** A shell icon name, drawn before the label. Blank draws none. */
  icon: string
  /** Lists the button under the round account button on a phone. */
  showOnPhone: boolean
}

export type PublicUserPanelLink = {
  /** Keeps a row steady while it is dragged. Never shown. */
  id: string
  label: string
  href: string
  icon: string
}

export type PublicUserPanel = Record<
  PublicUserPanelButtonKey,
  PublicUserPanelButton
> & {
  /** The signed-in menu's own links, in the order saved. */
  links: PublicUserPanelLink[]
}

export function createDefaultPublicUserPanel(): PublicUserPanel {
  return {
    login: {
      label: "Sign in",
      href: "/login",
      style: "outline",
      icon: "",
      showOnPhone: true,
    },
    register: {
      label: "Create an account",
      href: "/register",
      style: "primary",
      icon: "",
      showOnPhone: true,
    },
    links: [],
  }
}

/**
 * Why an address will not work, in the words the admin is told, or null. A
 * blank address is fine for a button, where it means "hide it", and a problem
 * for a link, which has nothing else to do.
 */
export function getPublicUserPanelAddressProblem(
  href: string,
  blankHides: boolean
) {
  const address = href.trim()
  if (!address) {
    return blankHides ? null : "Give this link an address, like /account."
  }
  if (isSafeWrittenPageLink(address)) return null
  return "Use an internal address like /account or a safe full address like https://example.com."
}

/**
 * Reads a saved panel back into a whole one. It runs on every read as well as
 * on the save, so a hand-edited row can never put an unsafe address in the
 * header. A missing or broken part falls back to that part's default.
 */
export function normalizePublicUserPanel(value: unknown): PublicUserPanel {
  const fallback = createDefaultPublicUserPanel()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const saved = value as Record<string, unknown>
  return {
    login: cleanButton(saved.login, fallback.login),
    register: cleanButton(saved.register, fallback.register),
    links: cleanLinks(saved.links),
  }
}

function cleanButton(
  value: unknown,
  fallback: PublicUserPanelButton
): PublicUserPanelButton {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const saved = value as Record<string, unknown>
  const href = cleanText(saved.href, MAX_PUBLIC_USER_PANEL_HREF_LENGTH)
  return {
    // A blank name would draw an empty button, so it keeps the default word.
    label:
      cleanText(saved.label, MAX_PUBLIC_USER_PANEL_LABEL_LENGTH) ||
      fallback.label,
    // Blank stays blank, since that is how a button is hidden. An unsafe
    // address hides it too, rather than sending visitors somewhere unsafe.
    href: href && isSafeWrittenPageLink(href) ? href : "",
    style: PUBLIC_USER_PANEL_BUTTON_STYLES.includes(
      saved.style as PublicUserPanelButtonStyle
    )
      ? (saved.style as PublicUserPanelButtonStyle)
      : fallback.style,
    icon: cleanText(saved.icon, MAX_ICON_LENGTH),
    showOnPhone:
      typeof saved.showOnPhone === "boolean"
        ? saved.showOnPhone
        : fallback.showOnPhone,
  }
}

function cleanLinks(value: unknown): PublicUserPanelLink[] {
  if (!Array.isArray(value)) return []

  const seenIds = new Set<string>()
  const links: PublicUserPanelLink[] = []
  for (const item of value.slice(0, MAX_PUBLIC_USER_PANEL_LINKS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const saved = item as Record<string, unknown>
    const label = cleanText(saved.label, MAX_PUBLIC_USER_PANEL_LABEL_LENGTH)
    const href = cleanText(saved.href, MAX_PUBLIC_USER_PANEL_HREF_LENGTH)
    if (!label || !href || !isSafeWrittenPageLink(href)) continue

    let id = cleanText(saved.id, 100)
    let next = links.length
    while (!id || seenIds.has(id)) id = `public-user-panel-link-${next++}`
    seenIds.add(id)
    links.push({ id, label, href, icon: cleanText(saved.icon, MAX_ICON_LENGTH) })
  }
  return links
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}
