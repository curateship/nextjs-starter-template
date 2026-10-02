import * as React from "react"
import { toast } from "sonner"

import { useTradePageTitle } from "@/app/page-title"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import {
  getSocialStocksLoadErrorMessage,
  getSocialStocksSaveErrorMessage,
  loadSocialStocksSetting,
  saveSocialStocksSetting,
} from "@/lib/api/trade/social-settings"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → Social: whether a post's words are read for stocks as well as
 * coins.
 *
 * One switch, and it is off until somebody asks for it. A stock ticker is
 * three letters a company liked, so `ALL`, `KEY`, `CAR` and `WELL` are all
 * real listings and all ordinary words, and a coin-only member who got stocks
 * by default would find their creators credited with markets nobody named.
 */
export default function SocialSettings() {
  useTradePageTitle("Settings")
  return (
    <CardGroup>
      <SocialStocksCard />
    </CardGroup>
  )
}

function SocialStocksCard() {
  const mounted = React.useRef(false)
  const [stocks, setStocks] = React.useState<boolean | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    loadSocialStocksSetting()
      .then((answer) => {
        if (!mounted.current) return
        setStocks(answer)
        setLoadFailed(false)
      })
      .catch((error: unknown) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getSocialStocksLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  const change = async (on: boolean) => {
    if (busy || stocks === null) return
    const previous = stocks
    setStocks(on)
    setBusy(true)
    try {
      const saved = await saveSocialStocksSetting(on)
      if (mounted.current) setStocks(saved)
      toast.success(
        saved
          ? "Stocks are in. Every creator is read again the next time you open them, and their stock posts arrive in their own group."
          : "Stocks are out. Every stock, metal and currency already matched has been removed."
      )
    } catch (error) {
      if (mounted.current) setStocks(previous)
      showErrorToast(getSocialStocksSaveErrorMessage(error))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reading posts</CardTitle>
        <CardDescription>
          What Trade looks for in the words of a creator's post.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stocks === null ? (
          <div className="flex items-center justify-between gap-3">
            {loadFailed ? (
              <p className="text-sm text-muted-foreground">
                The stocks setting could not be loaded.
              </p>
            ) : (
              <LoadingRow label="Reading the stocks setting" />
            )}
            {loadFailed ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoadFailed(false)
                  load()
                }}
              >
                Try again
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="social-stocks" className="min-w-0">
              <span className="block text-sm font-medium">
                Stocks, metals and currencies
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                On, "$TSLA into earnings" counts as a post about TSLA. Off, only
                coins count. Stock tickers are ordinary words far more often
                than coin tickers are, so a post shouting KEY or WELL can be
                read as a market nobody meant, and the words still have to be
                in capitals or carry a dollar sign.
              </span>
            </label>
            <Switch
              id="social-stocks"
              checked={stocks}
              disabled={busy}
              onCheckedChange={(checked) => void change(checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
