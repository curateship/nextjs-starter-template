import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { AuthError, AuthLayout } from "@/components/pomoder/auth-layout"
import { getAuthErrorMessage, requestPasswordReset } from "@/lib/api/auth"

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordRoute })

function ForgotPasswordRoute() {
  const [email, setEmail] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  return <AuthLayout><h1>Reset your password</h1><p>{sent ? "If an account exists for that address, a reset link is on its way." : "Enter the email you use for Pomoder."}</p>{sent ? <Link to="/login" className="pill-button">Back to sign in</Link> : <form onSubmit={async (event) => { event.preventDefault(); setError(null); try { await requestPasswordReset(email); setSent(true) } catch (cause) { setError(getAuthErrorMessage(cause)) } }}><label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><AuthError message={error} /><button className="pill-button">Send reset link</button></form>}</AuthLayout>
}
