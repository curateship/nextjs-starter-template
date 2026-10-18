import { createFileRoute, notFound } from "@tanstack/react-router"

import { SharedProgramPage } from "@/components/fitness/public/shared-program-page"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { loadShared } from "@/lib/api/fitness/sharing"

/**
 * A program its owner shared, at /r/<code>. Anyone with the link can read the
 * plan and copy it into their own account. A code that was never made, or a
 * program whose sharing was switched off, gets the same not-found page.
 */
export const Route = createFileRoute("/r/$code")({
  loader: async ({ params }) => {
    const [program, user] = await Promise.all([loadShared(params.code), loadCurrentUser()])
    if (!program) throw notFound()
    return { program, signedIn: Boolean(user) }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.program.name}, a shared program` },
          {
            name: "description",
            content: `${loaderData.program.days.length} workout days a week of ${loaderData.program.routineLabel.toLowerCase()}. Copy it into your own account.`,
          },
        ]
      : [],
  }),
  component: SharedProgramRoute,
  errorComponent: visitorRouteErrorComponent(),
})

function SharedProgramRoute() {
  const { program, signedIn } = Route.useLoaderData()
  return <SharedProgramPage program={program} signedIn={signedIn} />
}
