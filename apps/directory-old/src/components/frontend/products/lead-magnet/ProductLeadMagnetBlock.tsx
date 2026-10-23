"use client"

import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import Image from "@/components/app-image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { normalizeProductLeadMagnetContent, renderProductLeadMagnetTokens } from "@/lib/actions/products/lead-magnet"
import { sanitizeRichMediaHtml } from "@/lib/utils/html-sanitizer"

interface ProductLeadMagnetBlockProps {
  content?: Record<string, any>
  children?: ReactNode
  siteId: string
  productId: string
  blockId: string
  productTitle?: string
  featureImage?: string | null
  imageAlt?: string
  isPreview?: boolean
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function ProductLeadMagnetBlock({
  content,
  children,
  siteId,
  productId,
  blockId,
  productTitle = "",
  featureImage,
  imageAlt,
  isPreview = false,
  siteWidth = 'custom',
  customWidth,
}: ProductLeadMagnetBlockProps) {
  const normalizedContent = useMemo(() => normalizeProductLeadMagnetContent(content), [content])
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const visibility = normalizedContent.visibility
  const productFeatureImage = typeof featureImage === "string" ? featureImage.trim() : ""

  if (visibility.hideBlock === true) {
    return null
  }

  const renderedBody = renderProductLeadMagnetTokens(normalizedContent.body, productTitle, { html: true })
  const safeBody = sanitizeRichMediaHtml(renderedBody)
  const showBody = visibility.body !== false && (children || safeBody.trim())
  const showImage = visibility.image !== false && productFeatureImage.length > 0
  const showForm = visibility.form !== false
  const hasTwoColumns = Boolean(showImage)

  const getRedirectUrl = () => {
    const redirectUrl = normalizedContent.redirectUrl.trim()
    if (!redirectUrl) return ""
    if (redirectUrl.startsWith("/")) return redirectUrl

    try {
      const url = new URL(redirectUrl)
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
    } catch {
      return ""
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isPreview || !email.trim()) return

    setStatus("loading")
    setErrorMessage("")

    try {
      const response = await fetch("/api/products/lead-magnet", {
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
        throw new Error("Signup failed")
      }

      setEmail("")
      const redirectUrl = getRedirectUrl()
      if (redirectUrl) {
        // Admin-configured redirect after signup — may be an external URL or an
        // internal path, so use a full navigation that handles both. Keep
        // intentional; do not convert to SPA routing.
        window.location.assign(redirectUrl)
        return
      }
      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      <div className={hasTwoColumns ? "grid items-start gap-8 lg:grid-cols-2" : "max-w-3xl"}>
        <div className="space-y-6">
          {showBody ? (
            <div className="prose prose-lg dark:prose-invert max-w-none [&>*:first-child]:mt-0! [&>div:first-child>*:first-child]:mt-0! [&_.ProseMirror>*:first-child]:mt-0! [&_img]:h-auto [&_img]:max-w-full">
              {children || <div dangerouslySetInnerHTML={{ __html: safeBody }} />}
            </div>
          ) : null}

          {showForm ? (
            <form onSubmit={handleSubmit} className="max-w-xl">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={normalizedContent.formPlaceholder}
                  required
                  disabled={isPreview || status === "loading"}
                  className="h-11 flex-1"
                />
                <Button type="submit" disabled={isPreview || status === "loading"} className="h-11">
                  {status === "loading" ? "Sending..." : normalizedContent.buttonText}
                </Button>
              </div>
              {status === "success" ? (
                <p className="mt-2 text-sm text-muted-foreground">Check your email.</p>
              ) : null}
              {status === "error" ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
              ) : null}
            </form>
          ) : null}
        </div>

        {showImage ? (
          <div className="overflow-hidden rounded-lg border bg-muted">
            <Image
              src={productFeatureImage}
              alt={imageAlt || "Lead magnet feature image"}
              width={900}
              height={700}
              className="h-auto w-full object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        ) : null}
      </div>
    </BlockContainer>
  )
}
