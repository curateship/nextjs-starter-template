import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { sendCopyrightReport } from "@/lib/api/pomodoro/shared-media"
import { contentColumn } from "@/lib/pomodoro/content-column"
import {
  COPYRIGHT_EMAIL_MAX,
  COPYRIGHT_NAME_MAX,
  COPYRIGHT_STATEMENT,
  COPYRIGHT_THANKS,
  COPYRIGHT_URL_MAX,
  COPYRIGHT_WORK_MAX,
} from "@/lib/pomodoro/shared-media-reports"
import { showErrorToast } from "@/lib/toast/error-toast"

type Field = "name" | "email" | "address" | "work" | "statement"

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * `/copyright`: for someone with no account to ask for a shared file to
 * come down (uploads-and-sharing task 05, part 6). It lands in the admins'
 * report queue as "Copyright, outside", and the admin answers by email.
 */
export function CopyrightPage() {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    address: "",
    work: "",
    statement: false,
  })
  const [problems, setProblems] = React.useState<Set<Field>>(new Set())
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const ids = {
    name: React.useId(),
    email: React.useId(),
    address: React.useId(),
    work: React.useId(),
    statement: React.useId(),
  }

  const change = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }))
    setProblems(new Set())
  }

  const send = async () => {
    const missing = new Set<Field>()
    if (!form.name.trim()) missing.add("name")
    if (!EMAIL_SHAPE.test(form.email.trim())) missing.add("email")
    if (!form.address.trim()) missing.add("address")
    if (!form.work.trim()) missing.add("work")
    if (!form.statement) missing.add("statement")
    if (missing.size) {
      setProblems(missing)
      showErrorToast(
        missing.has("email") && missing.size === 1
          ? "That email address does not look right."
          : "Fill in every field and tick the statement, then send it."
      )
      return
    }
    setSending(true)
    try {
      await sendCopyrightReport({ ...form, statement: true })
      setSent(true)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      showErrorToast(
        text.includes("RATE_LIMITED")
          ? "That is a lot of reports from one place. Try again in an hour."
          : "That report could not be sent. Try again."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <header className="title-halo flex flex-col gap-2">
        <h2 className="text-4xl font-bold tracking-tight">Copyright</h2>
        <p className="max-w-xl text-muted-foreground">
          Members can share their own sounds and backgrounds. If one copies a
          work you own, tell us here and we will take it down. You do not need
          an account.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Ask for a file to come down</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p role="status">{COPYRIGHT_THANKS}</p>
          ) : (
            <form
              className="grid max-w-xl gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void send()
              }}
            >
              <fieldset disabled={sending} className="contents">
                <div className="grid gap-2">
                  <Label htmlFor={ids.name}>Your name</Label>
                  <Input
                    id={ids.name}
                    value={form.name}
                    maxLength={COPYRIGHT_NAME_MAX}
                    autoComplete="name"
                    aria-invalid={problems.has("name") || undefined}
                    onChange={(event) => change({ name: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={ids.email}>Email we can reply to</Label>
                  <Input
                    id={ids.email}
                    type="email"
                    value={form.email}
                    maxLength={COPYRIGHT_EMAIL_MAX}
                    autoComplete="email"
                    aria-invalid={problems.has("email") || undefined}
                    onChange={(event) => change({ email: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={ids.address}>The file's address on Pomoder</Label>
                  <Input
                    id={ids.address}
                    value={form.address}
                    maxLength={COPYRIGHT_URL_MAX}
                    placeholder="https://pomoder.com/u/someone/files/…"
                    aria-invalid={problems.has("address") || undefined}
                    onChange={(event) => change({ address: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={ids.work}>What work it copies</Label>
                  <Textarea
                    id={ids.work}
                    value={form.work}
                    maxLength={COPYRIGHT_WORK_MAX}
                    placeholder="The title, who made it, and where it was first published."
                    aria-invalid={problems.has("work") || undefined}
                    onChange={(event) => change({ work: event.target.value })}
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={ids.statement}
                    className="mt-0.5"
                    checked={form.statement}
                    aria-invalid={problems.has("statement") || undefined}
                    onCheckedChange={(checked) =>
                      change({ statement: checked === true })
                    }
                  />
                  <Label htmlFor={ids.statement} className="leading-snug font-normal">
                    {COPYRIGHT_STATEMENT}
                  </Label>
                </div>
                <div>
                  <Button type="submit">
                    {sending ? (
                      <Loader2Icon className="animate-spin" aria-hidden="true" />
                    ) : null}
                    Send
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
