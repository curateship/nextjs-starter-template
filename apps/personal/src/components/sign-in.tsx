import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * The only thing Personal shows until the password is typed. It sits on the
 * address that was asked for, so signing in opens that screen straight away.
 */
export function SignIn({
  passwordSet,
  onSignIn,
  onCheckAgain,
}: {
  passwordSet: boolean
  /** Resolves to why the sign-in failed, or null once signed in. */
  onSignIn: (password: string) => Promise<string | null>
  onCheckAgain: () => void
}) {
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const problem = await onSignIn(password)
    // A right password unmounts this screen, so only a refusal lands here.
    if (problem) {
      setBusy(false)
      setError(problem)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }

  return (
    <main className="shell-canvas flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-6 shrink-0 dark:hidden" />
          <img src="/logo-dark.png" alt="" className="hidden size-6 shrink-0 dark:block" />
          <h1 className="text-sm font-semibold">Personal</h1>
        </div>
        {passwordSet ? (
          <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="personal-password">Password</Label>
              <Input
                ref={inputRef}
                id="personal-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "personal-password-error" : undefined}
              />
              {error ? (
                <p id="personal-password-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <Button type="submit" className="w-full">
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        ) : (
          <div role="alert" className="flex flex-col items-start gap-3 text-sm">
            <p className="font-medium">No password is set yet.</p>
            <p className="text-muted-foreground">
              Add a line PERSONAL_PASSWORD= with your password to apps/personal/.env.local,
              then check again.
            </p>
            <Button size="sm" onClick={onCheckAgain}>
              Check again
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
