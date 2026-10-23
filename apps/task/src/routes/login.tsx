import { createFileRoute, redirect } from "@tanstack/react-router"

import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { SignInForm, signInError } from "@/components/shell/sign-in-form"
import {
  getAuthErrorMessage,
  loadCurrentUser,
  loadSignInOptions,
} from "@/lib/api/auth/auth"
import { safeRedirectPath } from "@/lib/nav/redirect-path"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => {
    const redirectTo = safeRedirectPath(search.redirect)
    const error = signInError(search.error)
    return {
      ...(redirectTo ? { redirect: redirectTo } : {}),
      ...(error ? { error } : {}),
    }
  },
  loader: async () => {
    const [user, options] = await Promise.all([
      loadCurrentUser(),
      loadSignInOptions(),
    ])
    if (user) {
      throw redirect({ to: "/home", replace: true })
    }
    return options
  },
  errorComponent: visitorRouteErrorComponent(getAuthErrorMessage),
  component: LoginRoute,
})

function LoginRoute() {
  const { google, passkeys } = Route.useLoaderData()
  const { redirect: redirectTo, error: signInFailure } = Route.useSearch()
  // Bare, like the front page: the card alone, with no menu and no footer.
  return (
    <SignInForm
      bare
      google={google}
      passkeys={passkeys}
      redirectTo={redirectTo}
      signInFailure={signInFailure}
    />
  )
}
