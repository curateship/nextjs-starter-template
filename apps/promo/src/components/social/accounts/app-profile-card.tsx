import * as React from "react"
import { Loader2Icon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Textarea } from "@/components/ui/textarea"
import {
  applyProfileEdit,
  getPhoneAppErrorMessage,
  loadProfileEdits,
  type ProfileEditView,
} from "@/lib/api/social/phone-apps"
import { formatDateTime } from "@/lib/format/format-time"
import { NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { BIO_MAX, DISPLAY_NAME_MAX } from "@/lib/social/phone-apps"
import { showErrorToast } from "@/lib/toast/error-toast"

type Loaded = Awaited<ReturnType<typeof loadProfileEdits>>

/**
 * An Instagram or TikTok account's profile, set from Promo and applied in
 * the app by its phone (phone farm file 06, part 33): the name shown, the
 * bio, the link and the picture from the media library. The boxes start
 * with what Promo last set. Apply sends only what changed, on its own button
 * apart from the window's Save changes, and the phone types it in. In the
 * account's first day after signing in on its phone, Apply is refused and
 * says from when it may go.
 */
export function AppProfileCard({ accountId, network }: { accountId: string; network: PhoneAppNetwork }) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [displayName, setDisplayName] = React.useState("")
  const [bio, setBio] = React.useState("")
  const [link, setLink] = React.useState("")
  const [picture, setPicture] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const read = React.useCallback(
    () =>
      loadProfileEdits(accountId).then(
        (next) => {
          setLoaded(next)
          setError(null)
          setDisplayName(next.applied.displayName ?? "")
          setBio(next.applied.bio ?? "")
          setLink(next.applied.link ?? "")
          setPicture(next.applied.pictureUrl ?? "")
        },
        (failure: unknown) => setError(getPhoneAppErrorMessage(failure))
      ),
    [accountId]
  )

  React.useEffect(() => {
    void read()
  }, [read])

  async function apply() {
    if (!loaded) return
    const applied = loaded.applied
    // A box left as Promo last set it is not sent, so the phone only touches what changed.
    const changed = (value: string, before: string | null) => (value.trim() === (before ?? "") ? null : value.trim())
    const fields = {
      displayName: changed(displayName, applied.displayName),
      bio: changed(bio, applied.bio),
      link: changed(link, applied.link),
      pictureUrl: picture && picture !== applied.pictureUrl ? picture : null,
    }
    if (Object.values(fields).every((value) => value === null)) {
      showErrorToast("Change the name, the bio, the link or the picture first.")
      return
    }
    setBusy(true)
    try {
      await applyProfileEdit({ accountId, ...fields })
      toast.success(`Sent to the phone. It changes the profile in the ${NETWORK_NAMES[network]} app.`)
      await read()
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error ? (
          <ErrorRow message={error} onRetry={() => void read()} />
        ) : !loaded ? (
          <LoadingRow label="Reading the profile Promo last set" />
        ) : (
          <>
            <div className="grid gap-2">
              <FieldLabel htmlFor={`profile-name-${accountId}`} hint={`Up to ${DISPLAY_NAME_MAX} characters.`}>
                Name
              </FieldLabel>
              <Input
                id={`profile-name-${accountId}`}
                value={displayName}
                maxLength={DISPLAY_NAME_MAX}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor={`profile-bio-${accountId}`} hint={`Up to ${BIO_MAX[network]} characters on ${NETWORK_NAMES[network]}.`}>
                Bio
              </FieldLabel>
              <Textarea
                id={`profile-bio-${accountId}`}
                value={bio}
                maxLength={BIO_MAX[network]}
                onChange={(event) => setBio(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={`profile-link-${accountId}`}
                hint={network === "tiktok" ? "TikTok shows a link only once the account has 1,000 followers." : "The website on the profile."}
              >
                Link
              </FieldLabel>
              <Input
                id={`profile-link-${accountId}`}
                type="url"
                value={link}
                placeholder="https://"
                onChange={(event) => setLink(event.target.value)}
              />
            </div>
            <ImageUpload label="Picture" value={picture} onChange={(value) => setPicture(value)} aspect="square" />
            <LastChange last={loaded.last} opensAt={loaded.opensAt} signedIn={loaded.signedIn} />
            <div>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void apply()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                Apply on the phone
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Where the newest change stands, and when the first day ends. */
function LastChange({ last, opensAt, signedIn }: { last: ProfileEditView | null; opensAt: Date | null; signedIn: boolean }) {
  const lines: Array<{ text: string; tone: "muted" | "error" }> = []
  if (!signedIn) {
    lines.push({ text: "The phone has not read the app signed in yet, so the profile cannot be changed. Sign in, then press Check now.", tone: "muted" })
  } else if (opensAt) {
    lines.push({ text: `It may be changed from ${formatDateTime(opensAt)}, a day after it signed in on its phone.`, tone: "muted" })
  }
  if (last?.status === "waiting") lines.push({ text: `A change sent ${formatDateTime(last.createdAt)} is on its way.`, tone: "muted" })
  if (last?.status === "done") lines.push({ text: `Last changed ${formatDateTime(last.createdAt)}.`, tone: "muted" })
  if (last?.status === "failed") lines.push({ text: `The change sent ${formatDateTime(last.createdAt)} did not go through: ${last.lastError}`, tone: "error" })
  if (!lines.length) return null
  return (
    <div className="grid gap-1">
      {lines.map((line) => (
        <p key={line.text} className={line.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {line.text}
        </p>
      ))}
    </div>
  )
}
