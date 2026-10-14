import * as React from "react"

import { ShellIconPicker } from "@/components/settings/shell-icon-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/**
 * Where a nav link points: its icon, its label and its address, on one row.
 *
 * The sidebar editor and the top-right menu editor draw the identical card —
 * only the words in the accessible labels differ, which is what `linkNoun` is
 * for ("Sidebar link", "Menu link").
 */
export function NavLinkDestinationCard({
  linkNoun,
  icon,
  label,
  href,
  onChange,
  labelInputRef,
  addressCheck,
}: {
  linkNoun: string
  icon: string
  label: string
  href: string
  onChange: (patch: { icon?: string; label?: string; href?: string }) => void
  labelInputRef: React.RefObject<HTMLInputElement | null>
  addressCheck: React.ComponentProps<typeof Input>
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Destination</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
          <ShellIconPicker
            value={icon}
            compact
            onValueChange={(next) => (next ? onChange({ icon: next }) : undefined)}
          />
          <Input
            ref={labelInputRef}
            value={label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="Label"
            aria-label={`${linkNoun} label`}
          />
          <Input
            value={href}
            onChange={(event) => onChange({ href: event.target.value })}
            placeholder="/admin/example"
            aria-label={`${linkNoun} URL`}
            {...addressCheck}
          />
        </div>
      </CardContent>
    </Card>
  )
}
