import { TradeBadge } from "@/components/trade/trade-badge"
import type { MarketRow } from "@/lib/protocols/contracts"

/**
 * The word beside a coin the venue itself warns about, in the shared badge.
 *
 * Neutral on purpose: the badge says what the venue said and passes no
 * judgement of its own. The coin is never hidden — "all of Solana" was the
 * point — but it must never look like a vetted one either. The longer
 * sentence rides in the title for anyone who wants to know what the word
 * means.
 */
const WORDS: Record<NonNullable<MarketRow["caution"]>, { word: string; why: string }> =
  {
    unverified: {
      word: "Unverified",
      why: "Nobody has vouched for this coin. Anyone can mint one and give it any name.",
    },
    suspicious: {
      word: "Suspicious",
      why: "The venue's own audit flagged this coin. Treat it as a likely trap.",
    },
  }

export function CautionBadge({
  caution,
  className,
}: {
  caution: NonNullable<MarketRow["caution"]>
  className?: string
}) {
  const { word, why } = WORDS[caution]
  return (
    <TradeBadge tone="neutral" className={className}>
      <span title={why}>{word}</span>
    </TradeBadge>
  )
}
