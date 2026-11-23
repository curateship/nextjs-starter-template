import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * The one sign-up link every free tool page ends with. A signed-in member
 * already has an account, so the pages leave it out for them.
 */
export function FreeToolSignUpCard() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Want to trade on these numbers? Connect your exchanges in one account.
        </p>
        <Button asChild className="w-fit">
          <Link to="/register">Create account</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
