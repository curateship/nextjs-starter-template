import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { startAuthentication } from "@simplewebauthn/browser"
import { KeyRoundIcon, Loader2Icon } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { getAuthErrorMessage } from "@/lib/api/auth"
import { beginPasskeySignIn, finishPasskeySignIn } from "@/lib/api/passkeys"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { safeRedirectPath } from "@/lib/redirect-path"
import { useBrowserSupportsWebAuthn } from "@/lib/use-webauthn-support"

/**
 * "Sign in with a passkey" on the sign-in page. Renders nothing until the
 * browser has said it can do WebAuthn at all — a button that could only ever
 * fail is worse than no button — and every refusal after that is a toast, with
 * the password form still sitting right there as the way in.
 */
export function PasskeySignIn({
  redirectTo,
  /** Drawn when the button is not sitting under another method's divider. */
  withDivider,
}: {
  redirectTo?: string
  withDivider: boolean
}) {
  const navigate = useNavigate()
  const supported = useBrowserSupportsWebAuthn()
  const [busy, setBusy] = React.useState(false)

  const handleClick = React.useCallback(async () => {
    dismissErrorToast()
    setBusy(true)

    try {
      const { options, challengeId } = await beginPasskeySignIn()
      const response = await startAuthentication({ optionsJSON: options })
      await finishPasskeySignIn({ challengeId, response })
      await navigate({
        to: safeRedirectPath(redirectTo) ?? "/home",
        replace: true,
      })
    } catch (signInError) {
      showErrorToast(
        signInError instanceof Error && signInError.name === "NotAllowedError"
          ? "The passkey prompt was closed. You can sign in with your password instead."
          : getAuthErrorMessage(signInError)
      )
      setBusy(false)
    }
  }, [navigate, redirectTo])

  if (!supported) {
    return null
  }

  return (
    <div className="grid gap-4">
      {withDivider ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => void handleClick()}
        disabled={busy}
      >
        {busy ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <KeyRoundIcon />
        )}
        Sign in with a passkey
      </Button>
    </div>
  )
}
