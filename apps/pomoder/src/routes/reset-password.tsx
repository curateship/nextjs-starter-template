import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { z } from "zod"

import { AuthError, AuthLayout } from "@/components/pomoder/auth-layout"
import { getAuthErrorMessage, resetPassword } from "@/lib/api/auth"

export const Route = createFileRoute("/reset-password")({ validateSearch: z.object({ token: z.string().optional() }), component: ResetPasswordRoute })

function ResetPasswordRoute() {
  const { token } = Route.useSearch()
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(token ? null : "This reset link is incomplete.")
  const [done, setDone] = React.useState(false)
  return <AuthLayout><h1>Choose a new password</h1><p>Use at least eight characters.</p>{done ? <Link to="/login" className="pill-button">Sign in with new password</Link> : <form onSubmit={async (event) => { event.preventDefault(); if (!token) return; setError(null); try { await resetPassword(token, password); setDone(true) } catch (cause) { setError(getAuthErrorMessage(cause)) } }}><label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><AuthError message={error} /><button className="pill-button" disabled={!token}>Reset password</button></form>}</AuthLayout>
}
