import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"

// What a saved secret's box displays while it is not being edited. Any string
// renders as dots in a password field; the length just makes it look like one.
const SAVED_SENTINEL = "••••••••••••"

/**
 * One box for a secret the server keeps scrambled: an API key, a webhook
 * secret, a storage secret. Its label, a short line saying whether one is
 * saved, and the password box.
 *
 * **A saved secret shows as dots** until the box is focused or typed in, so a
 * filled box means a secret is there. Focusing it clears the dots for typing.
 * The browser never has the secret itself, only the masked tail in `secret`.
 *
 * `onCommit` runs when focus leaves the box and when Enter is pressed: the
 * moment an auto-saving card saves straight away instead of waiting.
 *
 * `actions` sit beside the box (Test, Remove), and `children` under it, 8px
 * below, where a test's verdict goes. A card with no buttons leaves `actions`
 * out and the box stands alone.
 */
export function SecretKeyField({
  id,
  label,
  hint,
  secret,
  saved,
  placeholder,
  value,
  onChange,
  onCommit,
  actions,
  children,
}: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  /** What the server says about the saved secret; undefined reads as not set. */
  secret: SecretStatus | undefined
  /** Whether a secret is saved, so the idle box shows dots. */
  saved: boolean
  placeholder: string
  /** What has been typed and not yet saved. */
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const [editing, setEditing] = React.useState(false)
  const showSentinel = !value && !editing && saved

  const input = (
    <Input
      id={id}
      className="sm:flex-1"
      type="password"
      autoComplete="off"
      placeholder={placeholder}
      value={showSentinel ? SAVED_SENTINEL : value}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false)
        onCommit()
      }}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit()
      }}
    />
  )

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <FieldLabel htmlFor={id} hint={hint}>
          {label}
        </FieldLabel>
        <span className="text-sm text-muted-foreground">
          {secretStatusLabel(secret)}
        </span>
      </div>
      {actions === undefined ? (
        input
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {input}
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

type SecretStatus = {
  configured: boolean
  unreadable: boolean
  maskedKey: string | null
  source?: "settings" | "env" | null
}

/**
 * One short line saying whether a secret is saved and where it lives. Every
 * secret box in Settings says it the same way.
 */
function secretStatusLabel(secret: SecretStatus | undefined) {
  if (!secret) return "Not set"
  if (secret.unreadable) return "Set, but unreadable — paste it again"
  if (!secret.configured) return "Not set"
  if (secret.source === "env") {
    return `Using the server's own key ${secret.maskedKey}`
  }
  return `Set ${secret.maskedKey}`
}
