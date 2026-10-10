import type { GenerationKind } from "@/lib/pomodoro/generation"

/**
 * The one-off purchases (uploads-and-sharing task 07), browser-safe: what each
 * is, what it costs and the wording. See `workspace/docs/pro-perks.md`, "Buying
 * more".
 *
 * Tyler set the prices on 10 Oct 2026. Unlike Pro, whose price lives on its
 * plan row in Settings → Plans, these are written here: the server reads the
 * amount from this list and never from the browser, so a tampered request
 * cannot buy a pack at another price.
 */

const GIGABYTE = 1024 * 1024 * 1024

export const PURCHASES = {
  backgrounds_5: {
    label: "5 AI backgrounds",
    amountCents: 500,
    kind: "background",
    credits: 5,
  },
  soundscapes_20: {
    label: "20 AI soundscapes",
    amountCents: 300,
    kind: "soundscape",
    credits: 20,
  },
  space_10gb: {
    label: "10 GB more space for a year",
    amountCents: 500,
    bytes: 10 * GIGABYTE,
    months: 12,
  },
} as const

export type PurchaseProduct = keyof typeof PURCHASES

export const PURCHASE_PRODUCTS = Object.keys(PURCHASES) as [
  PurchaseProduct,
  ...PurchaseProduct[],
]

/** The pack that tops up one kind of AI generation. */
export const PACK_FOR_KIND: Record<GenerationKind, "backgrounds_5" | "soundscapes_20"> = {
  background: "backgrounds_5",
  soundscape: "soundscapes_20",
}

export const SPACE_PRODUCT = "space_10gb" as const

/** "$5", or "$2.50" when it has cents. */
export function formatPrice(amountCents: number) {
  const dollars = amountCents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/** "Buy 5 more for $5", on the generator once the month's are gone. */
export function buyPackLabel(kind: GenerationKind) {
  const pack = PURCHASES[PACK_FOR_KIND[kind]]
  return `Buy ${pack.credits} more for ${formatPrice(pack.amountCents)}`
}

/** "Get 10 GB more for $5", beside the space used. */
export function buySpaceLabel() {
  return `Get 10 GB more for ${formatPrice(PURCHASES.space_10gb.amountCents)}`
}

/** What the page says once Stripe has confirmed a purchase. */
export function purchasedMessage(product: PurchaseProduct) {
  return product === "space_10gb"
    ? "You have 10 GB more space for the next 12 months."
    : `${PURCHASES[product].label} added. They never run out at the end of a month.`
}
