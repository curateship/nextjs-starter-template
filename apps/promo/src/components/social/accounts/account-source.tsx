import * as React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getBansErrorMessage, saveAccountSource } from "@/lib/api/bans"
import { ACCOUNT_SOURCE_LABELS, ACCOUNT_SOURCES, isAccountSource, priceCents, priceWords, type AccountSource } from "@/lib/bans/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Where an account came from (Bans task, part 16): made or bought, the
 * seller's name and the price in dollars. The Bans dashboard groups bans by
 * seller with the dollars lost, so you stop buying from sellers whose
 * accounts get banned.
 */

export type SourceValue = { source: AccountSource | ""; seller: string; price: string }

const NOT_SAID = "none"

export function SourceFields({
  idPrefix,
  value,
  onChange,
  onCommit,
  priceInvalid,
}: {
  idPrefix: string
  value: SourceValue
  onChange: (next: SourceValue) => void
  /** Called when a field is left or a pick is made, for a window that saves as it goes. */
  onCommit?: (next: SourceValue) => void
  priceInvalid?: boolean
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-source`}>Made or bought</Label>
        <Select
          value={value.source || NOT_SAID}
          onValueChange={(picked) => {
            const next = { ...value, source: isAccountSource(picked) ? picked : ("" as const) }
            onChange(next)
            onCommit?.(next)
          }}
        >
          <SelectTrigger id={`${idPrefix}-source`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOT_SAID}>Not said</SelectItem>
            {ACCOUNT_SOURCES.map((source) => (
              <SelectItem key={source} value={source}>
                {ACCOUNT_SOURCE_LABELS[source]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value.source === "bought" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-seller`}>Seller</Label>
            <Input
              id={`${idPrefix}-seller`}
              value={value.seller}
              maxLength={120}
              placeholder="Who sold it"
              onChange={(event) => onChange({ ...value, seller: event.target.value })}
              onBlur={() => onCommit?.(value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-price`}>Price in dollars</Label>
            <Input
              id={`${idPrefix}-price`}
              inputMode="decimal"
              value={value.price}
              placeholder="40"
              aria-invalid={priceInvalid || undefined}
              onChange={(event) => onChange({ ...value, price: event.target.value })}
              onBlur={() => onCommit?.(value)}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

/** The settings window's card, saved as it changes: a pick at once, a typed field when it is left. */
export function AccountSourceCard({
  accountId,
  initial,
  onSaved,
}: {
  accountId: string
  initial: { kind: AccountSource | ""; seller: string; priceCents: number | null }
  onSaved: () => Promise<void> | void
}) {
  const [value, setValue] = React.useState<SourceValue>({ source: initial.kind, seller: initial.seller, price: priceWords(initial.priceCents) })
  const [saved, setSaved] = React.useState(value)
  const [priceInvalid, setPriceInvalid] = React.useState(false)

  async function commit(next: SourceValue) {
    if (next.source === saved.source && next.seller.trim() === saved.seller.trim() && next.price.trim() === saved.price.trim()) return
    const cents = priceCents(next.price)
    if (next.source === "bought" && cents === undefined) {
      setPriceInvalid(true)
      showErrorToast("The price is dollars, like 40 or 12.50.")
      return
    }
    setPriceInvalid(false)
    try {
      await saveAccountSource(accountId, { source: next.source, seller: next.seller, priceCents: cents ?? null })
      setSaved(next)
      await onSaved()
    } catch (error) {
      showErrorToast(getBansErrorMessage(error))
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Where it came from</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SourceFields idPrefix={`account-${accountId}`} value={value} onChange={setValue} onCommit={(next) => void commit(next)} priceInvalid={priceInvalid} />
      </CardContent>
    </Card>
  )
}
