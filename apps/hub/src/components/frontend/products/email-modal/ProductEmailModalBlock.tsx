"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizeProductEmailModalContent, PRODUCT_EMAIL_MODAL_OPEN_EVENT } from "@/lib/actions/products/email-modal"

interface ProductEmailModalDialogProps {
  content?: Record<string, any>
  siteId: string
  productId: string
  blockId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDismiss?: () => void
  isPreview?: boolean
}

function ProductEmailModalDialog({
  content,
  siteId,
  productId,
  blockId,
  open,
  onOpenChange,
  onDismiss,
  isPreview = false,
}: ProductEmailModalDialogProps) {
  const normalizedContent = useMemo(() => normalizeProductEmailModalContent(content), [content])
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const visibility = normalizedContent.visibility
  const descriptionText = visibility.description === false
    ? ""
    : status === "success"
      ? normalizedContent.successMessage
      : normalizedContent.description

  useEffect(() => {
    if (open) return

    setEmail("")
    setStatus("idle")
    setErrorMessage("")
  }, [open])

  const handleDismiss = () => {
    onDismiss?.()
    onOpenChange(false)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isPreview || !email.trim()) return

    setStatus("loading")
    setErrorMessage("")

    try {
      const response = await fetch("/api/products/email-modal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          productId,
          blockId,
          email,
        }),
      })

      if (!response.ok) {
        throw new Error("Subscription failed")
      }

      setEmail("")
      setStatus("success")
      onDismiss?.()
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="gap-4">
          <DialogTitle className={visibility.title === false ? "sr-only" : "text-2xl"}>
            {normalizedContent.title}
          </DialogTitle>
          {descriptionText ? (
            <DialogDescription className="text-lg">
              {descriptionText}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {status !== "success" ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2 pt-2">
              {visibility.emailLabel !== false ? (
                <Label htmlFor={`product-email-modal-email-${blockId}`} className="text-base font-semibold">
                  {normalizedContent.emailLabel}
                </Label>
              ) : null}
              <Input
                id={`product-email-modal-email-${blockId}`}
                type="email"
                aria-label={normalizedContent.emailLabel}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={normalizedContent.placeholder}
                required
                disabled={isPreview || status === "loading"}
                className="h-12 text-base"
              />
              {status === "error" ? (
                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {visibility.dismissButton !== false ? (
                <Button type="button" variant="outline" onClick={handleDismiss}>
                  {normalizedContent.dismissButtonText}
                </Button>
              ) : null}
              <Button type="submit" disabled={isPreview || status === "loading"}>
                {status === "loading" ? "Subscribing..." : normalizedContent.submitButtonText}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface ProductEmailModalBlockProps {
  content?: Record<string, any>
  siteId: string
  productId: string
  blockId: string
  isPreview?: boolean
}

export function ProductEmailModalBlock({
  content,
  siteId,
  productId,
  blockId,
  isPreview = false,
}: ProductEmailModalBlockProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const normalizedContent = useMemo(() => normalizeProductEmailModalContent(content), [content])
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const storageKey = `product-email-modal:${siteId}:${productId}:${blockId}`

  const markDismissed = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1")
    } catch {
      // Ignore storage failures; the modal should still work for the visitor.
    }
  }, [storageKey])

  const wasDismissed = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1"
    } catch {
      return false
    }
  }, [storageKey])

  useEffect(() => {
    if (normalizedContent.visibility.hideBlock === true) return

    const handleOpenModal = (event: Event) => {
      const blockIdToOpen = (event as CustomEvent<{ blockId?: string }>).detail?.blockId
      if (blockIdToOpen && blockIdToOpen !== blockId) return
      if (!blockIdToOpen) {
        const firstModal = document.querySelector<HTMLElement>('[data-product-email-modal-block="true"]')
        if (firstModal?.dataset.productEmailModalBlockId !== blockId) return
      }

      setHasOpened(true)
      setOpen(true)
    }

    window.addEventListener(PRODUCT_EMAIL_MODAL_OPEN_EVENT, handleOpenModal)
    return () => window.removeEventListener(PRODUCT_EMAIL_MODAL_OPEN_EVENT, handleOpenModal)
  }, [blockId, normalizedContent.visibility.hideBlock])

  useEffect(() => {
    if (isPreview || !normalizedContent.openOnScroll || normalizedContent.visibility.hideBlock === true) return
    if (wasDismissed()) return

    const element = triggerRef.current
    if (!element) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || wasDismissed()) return

      setHasOpened(true)
      setOpen(true)
      observer.disconnect()
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [isPreview, normalizedContent.openOnScroll, normalizedContent.visibility.hideBlock, wasDismissed])

  if (normalizedContent.visibility.hideBlock === true) {
    return null
  }

  return (
    <>
      <div
        ref={triggerRef}
        aria-hidden="true"
        className="h-px w-full opacity-0"
        data-product-email-modal-block="true"
        data-product-email-modal-block-id={blockId}
      />
      <ProductEmailModalDialog
        content={normalizedContent}
        siteId={siteId}
        productId={productId}
        blockId={blockId}
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && hasOpened) {
            markDismissed()
          }
          setOpen(nextOpen)
        }}
        onDismiss={markDismissed}
        isPreview={isPreview}
      />
    </>
  )
}
