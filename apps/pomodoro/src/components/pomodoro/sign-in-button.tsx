import { Link, useRouterState } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"

/**
 * The Sign in button that sits beside every sentence telling a guest to sign
 * in, so nobody has to go looking for it. It sends the page they are on as
 * `redirect`, and the sign-in screen brings them back to it afterwards. The
 * sign-in screen checks that value itself (`safeRedirectPath`), so this only
 * has to pass it along.
 */
export function SignInButton({
  size = "sm",
  variant = "outline",
}: {
  size?: "xs" | "sm" | "default"
  variant?: "default" | "outline"
}) {
  const here = useRouterState({ select: (state) => state.location.href })
  return (
    <Button asChild size={size} variant={variant}>
      <Link to="/login" search={{ redirect: here }}>
        Sign in
      </Link>
    </Button>
  )
}
