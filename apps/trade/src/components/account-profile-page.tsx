import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, SaveIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { getAuthErrorMessage, updateProfile } from "@/lib/api/auth"
import type { AuthUser } from "@/lib/api/auth"

export function AccountProfilePage({
  user,
  planName,
  isPaid,
  onSaved,
}: {
  user: AuthUser
  planName: string
  isPaid: boolean
  onSaved: () => void
}) {
  const [name, setName] = React.useState(user.name)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setSaved(false)
      setSaving(true)

      try {
        await updateProfile(name)
        setSaved(true)
        onSaved()
      } catch (saveError) {
        setError(getAuthErrorMessage(saveError))
      } finally {
        setSaving(false)
      }
    },
    [name, onSaved]
  )

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your profile and current plan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={isPaid ? "default" : "secondary"}>{planName}</Badge>
          <Badge variant="outline">
            {user.role === "admin" ? "Admin" : "Member"}
          </Badge>
          {user.emailVerified ? null : (
            <Badge variant="outline">Email not verified</Badge>
          )}
          <Button asChild variant="outline" className="ml-auto">
            <Link to="/account/billing">Manage billing</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              This name shows up next to your activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                required
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="account-email"
                hint="Contact support to change the email on the account."
              >
                Email
              </FieldLabel>
              <Input id="account-email" value={user.email} readOnly disabled />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4" />
                )}
                {saving ? "Saving" : "Save"}
              </Button>
              {saved ? (
                <span className="text-sm text-muted-foreground">Saved</span>
              ) : null}
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}
