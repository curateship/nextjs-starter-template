import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { z } from "zod"

import { AuthLayout } from "@/components/pomoder/auth-layout"
import { getAuthErrorMessage, verifyEmail } from "@/lib/api/auth"

export const Route = createFileRoute("/verify-email")({ validateSearch: z.object({ token: z.string().optional() }), component: VerifyEmailRoute })

function VerifyEmailRoute() {
  const { token } = Route.useSearch()
  const [status, setStatus] = React.useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = React.useState("Verifying your email…")
  React.useEffect(() => { if (!token) { setStatus("error"); setMessage("This verification link is incomplete."); return } void verifyEmail(token).then(() => { setStatus("success"); setMessage("Your email is verified. You can sign in now.") }).catch((cause) => { setStatus("error"); setMessage(getAuthErrorMessage(cause)) }) }, [token])
  return <AuthLayout><h1>{status === "success" ? "You’re verified" : status === "error" ? "Link not accepted" : "One moment"}</h1><p>{message}</p>{status !== "loading" ? <Link to="/login" className="pill-button">Continue to sign in</Link> : null}</AuthLayout>
}
