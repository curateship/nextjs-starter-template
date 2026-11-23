"use client"

import { useEffect, useMemo, useRef } from "react"
import ShoppingBag from "lucide-react/dist/esm/icons/shopping-bag.js"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  normalizeProductJustBoughtContent,
  renderProductJustBoughtToken,
  type ProductJustBoughtMessage,
} from "@/lib/actions/products/just-bought"

interface ProductJustBoughtBlockProps {
  content?: Record<string, any>
  productTitle: string
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function getVisibleMessageParts(
  message: ProductJustBoughtMessage,
  productTitle: string,
  visibility: Record<string, boolean>
) {
  return {
    avatar: visibility.avatar !== false ? message.avatar : "",
    buyerName: visibility.buyerName !== false ? message.buyerName.trim() : "",
    action: visibility.action !== false ? message.action.trim() : "",
    productText: visibility.productText !== false
      ? renderProductJustBoughtToken(message.productText, productTitle).trim()
      : "",
    timeText: visibility.timeText !== false ? message.timeText.trim() : "",
  }
}

function JustBoughtToast({
  message,
  productTitle,
  visibility,
}: {
  message: ProductJustBoughtMessage
  productTitle: string
  visibility: Record<string, boolean>
}) {
  const parts = getVisibleMessageParts(message, productTitle, visibility)
  const title = [parts.buyerName, parts.action, parts.productText].filter(Boolean).join(" ")

  return (
    <div className="flex w-[340px] max-w-[calc(100vw-32px)] items-center gap-3 rounded-lg border bg-background p-3 text-foreground shadow-lg">
      {visibility.avatar !== false ? (
        <Avatar className="size-10 border border-input bg-muted">
          {parts.avatar ? <AvatarImage src={parts.avatar} alt={parts.buyerName || "Buyer"} /> : null}
          <AvatarFallback className="text-xs font-medium">
            {parts.buyerName ? getInitials(parts.buyerName) : <ShoppingBag className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <div className="min-w-0">
        {title ? <p className="truncate text-sm font-medium">{title}</p> : null}
        {parts.timeText ? <p className="text-xs text-muted-foreground">{parts.timeText}</p> : null}
      </div>
    </div>
  )
}

export function ProductJustBoughtBlock({
  content,
  productTitle,
}: ProductJustBoughtBlockProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const messageIndexRef = useRef(0)
  const normalizedContent = useMemo(() => normalizeProductJustBoughtContent(content), [content])
  const visibility = normalizedContent.visibility
  const visibleMessages = useMemo(() => {
    return normalizedContent.messages.filter((message) => {
      const parts = getVisibleMessageParts(message, productTitle, visibility)
      return Boolean(parts.buyerName || parts.action || parts.productText || parts.timeText || parts.avatar)
    })
  }, [normalizedContent.messages, productTitle, visibility])

  useEffect(() => {
    if (visibility.hideBlock === true || visibleMessages.length === 0) return

    const element = triggerRef.current
    if (!element) return

    let hasStarted = false
    let intervalId: number | undefined

    const showNextToast = () => {
      if (!normalizedContent.loop && messageIndexRef.current >= visibleMessages.length) {
        if (intervalId) window.clearInterval(intervalId)
        return
      }

      const message = visibleMessages[messageIndexRef.current % visibleMessages.length]
      messageIndexRef.current += 1

      toast.custom(
        () => (
          <JustBoughtToast
            message={message}
            productTitle={productTitle}
            visibility={visibility}
          />
        ),
        {
          duration: normalizedContent.durationSeconds * 1000,
          position: "bottom-left",
        }
      )

      if (!normalizedContent.loop && messageIndexRef.current >= visibleMessages.length && intervalId) {
        window.clearInterval(intervalId)
      }
    }

    const observer = new IntersectionObserver((entries) => {
      if (hasStarted || !entries.some((entry) => entry.isIntersecting)) return

      hasStarted = true
      showNextToast()
      if (normalizedContent.loop || visibleMessages.length > 1) {
        intervalId = window.setInterval(showNextToast, normalizedContent.intervalSeconds * 1000)
      }
      observer.disconnect()
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [
    normalizedContent.durationSeconds,
    normalizedContent.intervalSeconds,
    normalizedContent.loop,
    productTitle,
    visibility,
    visibleMessages,
  ])

  if (visibility.hideBlock === true) {
    return null
  }

  return <div ref={triggerRef} aria-hidden="true" className="h-px w-full opacity-0" />
}
