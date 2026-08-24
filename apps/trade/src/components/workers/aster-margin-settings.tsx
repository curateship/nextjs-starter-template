import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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

export function AsterMarginSettings({
  initialWallets,
}: {
  initialWallets?: AsterMarginModeSetting[] | null
}) {
  const mounted = React.useRef(false)
  const [wallets, setWallets] = React.useState<AsterMarginModeSetting[] | null>(
    initialWallets ?? null
  )
  const [loadFailed, setLoadFailed] = React.useState(initialWallets === null)
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
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {loadFailed ? (
            "Aster's margin setting could not be loaded."
          ) : (
            <span className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
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
      </div>
    )
  }

  return (
    <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <h3 className="font-medium">Aster margin</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Isolated uses USDT only. Cross can use USDC and Aster's other
          supported collateral. Every fresh position follows the wallet's
          choice.
        </p>
      </div>
      {wallets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Connect and switch on an Aster mainnet wallet to choose its margin
          mode.
        </p>
      ) : (
        <div className="grid gap-3">
          {wallets.map((wallet) => (
            <div className="grid gap-1" key={wallet.walletId}>
              <Label htmlFor={`aster-margin-${wallet.walletId}`}>
                {wallet.label}
              </Label>
              <Select
                value={wallet.mode}
                disabled={busyWalletIds.has(wallet.walletId)}
                onValueChange={(mode) =>
                  void changeMode(wallet.walletId, mode as AsterMarginMode)
                }
              >
                <SelectTrigger
                  id={`aster-margin-${wallet.walletId}`}
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
          ))}
        </div>
      )}
    </div>
  )
}
