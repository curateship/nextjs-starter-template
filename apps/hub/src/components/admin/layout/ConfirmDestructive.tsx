"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import {
  DESTRUCTIVE_ACTION_POLICIES,
  getDestructiveConfigurationError,
  isDestructiveConfirmDisabled,
  matchesDestructiveConfirmation,
  type DestructiveAction,
} from "@/components/admin/layout/destructive-confirm-policy"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { getDeletionImpactAction } from "@/lib/actions/deletion-impact-actions"
import {
  deserializeDeletionImpactIds,
  serializeDeletionImpactIds,
  type DeletionImpactRequest,
  type DestructiveImpact,
  type DestructiveImpactResult,
} from "@/lib/actions/deletion-impact-contract"

export function ConfirmDestructive({
  action,
  cancelLabel = "Cancel",
  confirmationName,
  confirmLabel = "Delete",
  description,
  disabled = false,
  error,
  impactRequest,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  action: DestructiveAction
  cancelLabel?: string
  confirmationName?: string
  confirmLabel?: string
  description?: ReactNode
  disabled?: boolean
  error?: string | null
  impactRequest?: DeletionImpactRequest
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  open: boolean
  title: ReactNode
}) {
  const policy = DESTRUCTIVE_ACTION_POLICIES[action]
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmingRef = useRef(false)
  const [confirmation, setConfirmation] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [loadedImpact, setLoadedImpact] = useState<DestructiveImpact[]>([])
  const [impactError, setImpactError] = useState<string | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const impactIds = serializeDeletionImpactIds(impactRequest?.ids ?? [])
  const impactSiteId = impactRequest && "siteId" in impactRequest ? impactRequest.siteId : ""
  const impactTarget = impactRequest?.target

  useEffect(() => {
    if (!open) {
      setConfirmation("")
      setLoadedImpact([])
      setImpactError(null)
      setLoadingImpact(false)
      setSubmitError(null)
      return
    }
    const ids = deserializeDeletionImpactIds(impactIds)
    if (!impactTarget || ids.length === 0 || (impactTarget !== "user" && !impactSiteId)) {
      setLoadedImpact([])
      setImpactError(null)
      setLoadingImpact(false)
      return
    }

    let cancelled = false
    setLoadingImpact(true)
    setLoadedImpact([])
    setImpactError(null)
    const request: DeletionImpactRequest = impactTarget === "user"
      ? { ids, target: "user" }
      : { ids, siteId: impactSiteId, target: impactTarget }
    void getDeletionImpactAction(request).then((result: DestructiveImpactResult) => {
      if (cancelled) return
      if (result.error || !result.data) setImpactError(result.error || "Unable to load deletion impact")
      else setLoadedImpact(result.data)
    }).catch(() => {
      if (!cancelled) setImpactError("Unable to load deletion impact")
    }).finally(() => {
      if (!cancelled) setLoadingImpact(false)
    })

    return () => { cancelled = true }
  }, [impactIds, impactSiteId, impactTarget, open])

  const requiresName = policy.level === 3
  const configurationError = getDestructiveConfigurationError(policy.level, Boolean(impactRequest), confirmationName)
  const confirmationMatches = !requiresName || Boolean(confirmationName && matchesDestructiveConfirmation(confirmation, confirmationName))
  const confirmDisabled = isDestructiveConfirmDisabled({
    configurationError,
    confirming,
    disabled,
    impactError,
    loadingImpact,
    confirmationMatches,
  })

  async function handleConfirm() {
    if (confirmDisabled || confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    setSubmitError(null)
    try {
      await onConfirm()
    } catch (confirmError) {
      setSubmitError(confirmError instanceof Error ? confirmError.message : "Unable to complete this action")
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>{policy.consequence}</p>
          {loadingImpact ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading deletion impact">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : loadedImpact.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {loadedImpact.map((item) => (
                <li key={item.label}>{item.count.toLocaleString()} {item.label}</li>
              ))}
            </ul>
          ) : null}

          {requiresName && confirmationName ? (
            <div className="space-y-2">
              <Label htmlFor="destructive-confirm-name">Type <strong>{confirmationName}</strong> to confirm</Label>
              <Input
                id="destructive-confirm-name"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          ) : null}

          {(configurationError || impactError || error || submitError) ? (
            <p role="alert" className="text-destructive">{configurationError || impactError || error || submitError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button ref={cancelRef} onClick={onCancel} variant="outline">{cancelLabel}</Button>
          <Button
            onClick={handleConfirm}
            variant={action === "archive-form" ? "default" : "destructive"}
            disabled={confirmDisabled}
          >
            {confirming ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
