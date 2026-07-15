import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { AuthError, AuthLayout } from "@/components/pomoder/auth-layout"
import { getAuthErrorMessage, register } from "@/lib/api/auth"

export const Route = createFileRoute("/register")({ component: RegisterRoute })

function RegisterRoute() {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  return <AuthLayout><h1>{sent ? "Check your email" : "Create your account"}</h1><p>{sent ? "We sent a verification link. Open it to finish setting up Pomoder." : "Your local tasks and preferences will stay here when you start syncing."}</p>{sent ? <Link to="/login" className="pill-button">Back to sign in</Link> : <form onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(null); try { await register({ name, email, password }); setSent(true) } catch (cause) { setError(getAuthErrorMessage(cause)) } finally { setLoading(false) } }}><label>Name<input autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><AuthError message={error} /><button className="pill-button" disabled={loading}>{loading ? "Creating account…" : "Create free account"}</button></form>}<span>Already have an account? <Link to="/login">Sign in</Link></span></AuthLayout>
}
