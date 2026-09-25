import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeftRightIcon, Loader2Icon } from "lucide-react"

import { DecimalField } from "@/components/free-tools/decimal-field"
import { FreeToolSignUpCard } from "@/components/free-tools/sign-up-card"
import { getVisitorPageErrorMessage } from "@/components/shell/route-error"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { readConverterPrices } from "@/lib/api/trade/price-converter"
import {
  MAX_AMOUNT,
  convert,
  formatAge,
  formatConvertedCoins,
  formatConvertedUsd,
  isPriceOld,
  pairSlug,
  thousandOf,
  type ConverterCoin,
  type ConverterPrices,
  type Direction,
} from "@/lib/free-tools/price-converter"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatPrice } from "@/lib/trade/format"

/**
 * The page's sentence when it cannot load. Hyperliquid not sending its coin
 * list is the one failure worth naming; anything else gets the plain
 * public-page sentence.
 */
export function getConverterErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return message.includes("CONVERTER_COINS_UNAVAILABLE")
    ? "Hyperliquid did not send its list of coins. Try again in a minute."
    : getVisitorPageErrorMessage(error)
}

/**
 * `/tools/convert` and `/tools/convert/<coin>-usd`: a coin into dollars or
 * dollars into a coin, at the price the server last had from Hyperliquid.
 *
 * The prices arrive with the page. Typing, swapping and the ticking age are
 * worked out in the browser and ask nothing. Picking another coin opens that
 * coin's page, and Refresh price reads the server's copy again. Neither
 * reaches the exchange.
 */
export function PriceConverter({
  prices: served,
  symbol,
  signedIn,
}: {
  prices: ConverterPrices
  symbol: string
  signedIn: boolean
}) {
  const navigate = useNavigate()
  // A refresh replaces the prices the page arrived with, until the page
  // arrives again with newer ones (another coin picked).
  const [refreshed, setRefreshed] = React.useState<{
    over: ConverterPrices
    prices: ConverterPrices
  } | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const prices = refreshed?.over === served ? refreshed.prices : served
  const coin: ConverterCoin = prices.coins.find(
    (listed) => listed.symbol === symbol
  ) ?? { symbol, price: null, ownPage: false }

  const refresh = () => {
    setRefreshing(true)
    readConverterPrices()
      .then((next) => setRefreshed({ over: served, prices: next }))
      .catch((error: unknown) =>
        showErrorToast(getConverterErrorMessage(error))
      )
      .finally(() => setRefreshing(false))
  }
  const onCoinChange = (next: string) => {
    void navigate({
      to: "/tools/convert/$pair",
      params: { pair: pairSlug(next) },
      resetScroll: false,
    })
  }

  const [direction, setDirection] = React.useState<Direction>("coin-to-usd")
  const [amount, setAmount] = React.useState(1)
  const answer = convert(amount, coin.price, direction)
  const typingCoins = direction === "coin-to-usd"

  const swap = () => {
    // The answer becomes the typed amount, so the two boxes trade places.
    // Without a price there is no answer, and the amount stays as it was.
    if (answer !== null && answer <= MAX_AMOUNT) {
      setAmount(Number(answer.toPrecision(8)))
    }
    setDirection(typingCoins ? "usd-to-coin" : "coin-to-usd")
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-2 text-left md:gap-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {coin.symbol} to US dollars
        </h1>
        <p className="text-sm text-muted-foreground">
          Coins into dollars and dollars into coins at the live{" "}
          {prices.exchange} price.
        </p>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Your numbers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel htmlFor="convert-coin">Coin</FieldLabel>
            <Select value={coin.symbol} onValueChange={onCoinChange}>
              <SelectTrigger id="convert-coin" className="w-full sm:w-40">
                {/* Named here so the server's drawing already says the coin. */}
                <SelectValue>{coin.symbol}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {prices.coins.map((listed) => (
                  <SelectItem key={listed.symbol} value={listed.symbol}>
                    {listed.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
            <DecimalField
              id="convert-amount"
              label={typingCoins ? `Amount of ${coin.symbol}` : "Dollars"}
              unit={typingCoins ? coin.symbol : "$"}
              value={amount}
              min={0}
              max={MAX_AMOUNT}
              onChange={setAmount}
              className="sm:flex-1"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Swap coins and dollars"
                  className="self-center sm:self-end"
                  onClick={swap}
                >
                  <ArrowLeftRightIcon className="rotate-90 sm:rotate-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Swap coins and dollars</TooltipContent>
            </Tooltip>
            <AnswerField
              label={typingCoins ? "In dollars" : `In ${coin.symbol}`}
              unit={typingCoins ? "$" : coin.symbol}
              value={
                answer === null
                  ? "—"
                  : typingCoins
                    ? formatConvertedUsd(answer).replace(/^\$/, "")
                    : formatConvertedCoins(answer)
              }
            />
          </div>
        </CardContent>
      </Card>

      <AnswerCard
        prices={prices}
        coin={coin}
        amount={amount}
        answer={answer}
        direction={direction}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      {signedIn ? null : <FreeToolSignUpCard />}
    </div>
  )
}

/** The box the answer lands in: read-only, the same height as the one typed in. */
function AnswerField({
  label,
  unit,
  value,
}: {
  label: string
  unit: string
  value: string
}) {
  const before = unit === "$"
  return (
    <div className="grid min-w-0 gap-2 sm:flex-1">
      <FieldLabel htmlFor="convert-answer">{label}</FieldLabel>
      <div className="relative">
        <span
          aria-hidden="true"
          className={
            before
              ? "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
              : "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
          }
        >
          {unit}
        </span>
        <Input
          id="convert-answer"
          readOnly
          value={value}
          className={before ? "pl-7 tabular-nums" : "tabular-nums"}
          style={
            before
              ? undefined
              : { paddingRight: `calc(${unit.length}ch + 1.25rem)` }
          }
        />
      </div>
    </div>
  )
}

/**
 * The sentence with the price, where it came from and how old it is. A price
 * more than a minute old says "Old price" in words, not only in colour. A
 * coin with no price shows a dash and says why.
 */
function AnswerCard({
  prices,
  coin,
  amount,
  answer,
  direction,
  refreshing,
  onRefresh,
}: {
  prices: ConverterPrices
  coin: ConverterCoin
  amount: number
  answer: number | null
  direction: Direction
  refreshing: boolean
  onRefresh: () => void
}) {
  const elapsed = useElapsedSince(prices)
  const ageMs = prices.ageMs === null ? null : prices.ageMs + elapsed
  const old = ageMs !== null && isPriceOld(ageMs)
  const thousand = thousandOf(coin.symbol)

  let sentence: string
  if (coin.price === null || answer === null) {
    sentence = `${prices.exchange} has not sent a price for ${coin.symbol} yet, so there is no answer.`
  } else if (direction === "coin-to-usd") {
    sentence = `${formatConvertedCoins(amount)} ${coin.symbol} at ${formatPrice(coin.price)} = ${formatConvertedUsd(answer)}`
  } else {
    sentence = `${formatConvertedUsd(amount)} buys ${formatConvertedCoins(answer)} ${coin.symbol} at ${formatPrice(coin.price)}`
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>The answer</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p role="status" className="font-mono text-lg font-medium tabular-nums">
          {sentence}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {prices.exchange} price for one {coin.symbol}:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {coin.price === null ? "—" : formatPrice(coin.price)}
            </span>
            {ageMs === null ? (
              ", no price received yet."
            ) : (
              <>
                , read {formatAge(ageMs)}.
                {old ? (
                  <span className="ml-1 font-medium text-destructive">
                    Old price.
                  </span>
                ) : null}
              </>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? <Loader2Icon className="animate-spin" /> : null}
            Refresh price
          </Button>
        </div>
        {thousand ? (
          <p className="text-sm text-muted-foreground">
            On {prices.exchange}, 1 {coin.symbol} is 1,000 {thousand}, so the
            price is for 1,000 {thousand}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Milliseconds since `stamp` last changed, counted in the browser once a
 * second. Starts at zero so the server's drawing and the browser's first
 * drawing agree, and counts from the visitor's own clock so a clock that is
 * set wrong cannot make a fresh price look old.
 */
function useElapsedSince(stamp: unknown): number {
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    const start = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000)
    return () => clearInterval(timer)
  }, [stamp])
  return elapsed
}
