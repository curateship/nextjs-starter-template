import * as React from "react"
import { Loader2Icon, WalletCardsIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getAsterMarginModeLoadErrorMessage,
  getAsterMarginModeSaveErrorMessage,
  loadAsterMarginModes,
  saveAsterMarginMode,
} from "@/lib/api/aster-margin-mode"
import type {
  AsterMarginMode,
  AsterMarginModeSetting,
} from "@/lib/trade/aster-margin-mode"
import { showErrorToast } from "@/lib/toast/error-toast"

export function AsterMarginSettings() {
  const mounted = React.useRef(false)
  const [wallets, setWallets] = React.useState<AsterMarginModeSetting[] | null>(
    null
  )
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busyWalletIds, setBusyWalletIds] = React.useState<Set<string>>(
    () => new Set()
  )

  const load = React.useCallback(() => {
    void loadAsterMarginModes()
      .then((answer) => {
        if (!mounted.current) return
        setWallets(answer)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getAsterMarginModeLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  const changeMode = async (walletId: string, mode: AsterMarginMode) => {
    const beforeMode = wallets?.find(
      (wallet) => wallet.walletId === walletId
    )?.mode
    setWallets(
      (current) =>
        current?.map((wallet) =>
          wallet.walletId === walletId ? { ...wallet, mode } : wallet
        ) ?? null
    )
    setBusyWalletIds((current) => new Set(current).add(walletId))
    try {
      const saved = await saveAsterMarginMode(walletId, mode)
      setWallets(
        (current) =>
          current?.map((wallet) =>
            wallet.walletId === walletId ? saved : wallet
          ) ?? null
      )
      toast.success(`Aster now uses ${mode} margin.`)
    } catch (error) {
      if (beforeMode) {
        setWallets(
          (current) =>
            current?.map((wallet) =>
              wallet.walletId === walletId
                ? { ...wallet, mode: beforeMode }
                : wallet
            ) ?? null
        )
      }
      showErrorToast(getAsterMarginModeSaveErrorMessage(error))
    } finally {
      setBusyWalletIds((current) => {
        const next = new Set(current)
        next.delete(walletId)
        return next
      })
    }
  }

  if (wallets === null) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {loadFailed ? (
              "Aster's margin setting could not be loaded."
            ) : (
              <span className="flex items-center gap-2">
                <Loader2Icon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Loading Aster margin…
              </span>
            )}
          </p>
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
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WalletCardsIcon className="size-4" />
          Aster margin
        </CardTitle>
        <CardDescription>
          Isolated uses USDT only. Cross can use USDC and Aster's other
          supported collateral. Every fresh position follows the wallet's
          choice.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect and switch on an Aster mainnet wallet to choose its margin
            mode.
          </p>
        ) : (
          wallets.map((wallet) => (
            <div className="grid gap-2" key={wallet.walletId}>
              <FieldLabel
                htmlFor={`aster-margin-${wallet.walletId}`}
                hint={
                  wallet.mode === "isolated"
                    ? "Aster uses Single-Asset Mode for isolated margin."
                    : "Aster uses Multi-Assets Mode for cross margin."
                }
              >
                {wallet.label}
              </FieldLabel>
              <Select
                value={wallet.mode}
                disabled={busyWalletIds.has(wallet.walletId)}
                onValueChange={(mode) =>
                  void changeMode(wallet.walletId, mode as AsterMarginMode)
                }
              >
                <SelectTrigger
                  id={`aster-margin-${wallet.walletId}`}
                  className="w-fit"
                  aria-label={`Margin mode for ${wallet.label}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="isolated">Isolated margin</SelectItem>
                  <SelectItem value="cross">Cross margin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
