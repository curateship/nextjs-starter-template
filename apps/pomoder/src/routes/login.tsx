import * as React from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"

import { AuthError, AuthLayout } from "@/components/pomoder/auth-layout"
import { getAuthErrorMessage, loadCurrentUser, login } from "@/lib/api/auth"
import { importGuestState } from "@/lib/api/productivity"

export const Route = createFileRoute("/login")({
  loader: async () => { if (await loadCurrentUser()) throw redirect({ to: "/" }) },
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  return <AuthLayout><h1>Welcome back</h1><p>Sign in to sync your tasks, streaks and focus rooms.</p><form onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(null); try { await login(email, password); await importGuestData(); await navigate({ to: "/" }) } catch (cause) { setError(getAuthErrorMessage(cause)) } finally { setLoading(false) } }}><label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><AuthError message={error} /><button className="pill-button" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button></form><Link to="/forgot-password" className="auth-secondary-link">Forgot password?</Link><span>New to Pomoder? <Link to="/register">Create an account</Link></span></AuthLayout>
}

async function importGuestData() {
  try {
    const saved = window.localStorage.getItem("pomoder:guest:v1")
    if (!saved) return
    const state = JSON.parse(saved) as { tasks?: Array<{ title: string; completed: boolean; pomodoros: number }>; durations?: { focus: number; short: number; long: number }; autoStart?: boolean }
    await importGuestState({ tasks: state.tasks || [], focusMinutes: state.durations?.focus || 25, shortBreakMinutes: state.durations?.short || 5, longBreakMinutes: state.durations?.long || 15, autoStart: state.autoStart || false })
    window.localStorage.removeItem("pomoder:guest:v1")
  } catch { /* Keep local data so the user can retry the import. */ }
}
