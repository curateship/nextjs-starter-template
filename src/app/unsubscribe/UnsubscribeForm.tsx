"use client"

import { useState } from "react"
import { unsubscribeContact } from "@/lib/actions/newsletters/contact-actions"

export function UnsubscribeForm({
  siteId,
  initialEmail,
  token,
  siteName,
}: {
  siteId: string
  initialEmail: string
  token: string
  siteName: string
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const handleUnsubscribe = async () => {
    if (!initialEmail || !token) return

    setStatus("loading")
    const { success, error } = await unsubscribeContact(siteId, initialEmail, token)

    if (success) {
      setStatus("success")
    } else {
      setStatus("error")
      setErrorMsg(error || "Something went wrong")
    }
  }

  if (status === "success") {
    return (
      <div className="text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold mb-2">You&apos;ve been unsubscribed</h1>
        <p className="text-gray-600">
          You will no longer receive marketing emails{siteName ? ` from ${siteName}` : ""}.
        </p>
      </div>
    )
  }

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold mb-2">Unsubscribe</h1>
      <p className="text-gray-600 text-sm mb-6">
        Click below to unsubscribe <strong>{initialEmail}</strong> from marketing emails{siteName ? ` from ${siteName}` : ""}.
      </p>

      {status === "error" && (
        <p className="text-red-600 text-sm mb-4">{errorMsg}</p>
      )}

      <button
        onClick={handleUnsubscribe}
        disabled={status === "loading"}
        className="w-full py-2 px-4 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "loading" ? "Processing..." : "Unsubscribe"}
      </button>
    </div>
  )
}
