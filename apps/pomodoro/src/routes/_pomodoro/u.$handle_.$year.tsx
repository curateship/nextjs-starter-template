import { createFileRoute, notFound } from "@tanstack/react-router"

import { YearInReviewPage } from "@/components/pomodoro/public-profile-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { readYearInReview } from "@/lib/api/pomodoro/public-profile"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"

/**
 * One year of one profile, `/u/<handle>/<year>`, built to be shared.
 *
 * It rides on the profile's figures switch: every number on it is one of the
 * figures, so publishing the recap without publishing the figures would be a
 * hole in that switch rather than a feature.
 *
 * `$handle_` with the underscore is what stops this page nesting inside the
 * profile page. Without it the router treats `/u/$handle` as this page's
 * layout, and since that page draws no outlet, a visit to a year address
 * silently drew the profile instead. `rooms_.$slug.tsx` is the same move.
 *
 * A year that is not four digits, a year before 2025, a year that has not
 * happened, and every reason the profile itself 404s all answer the same 404.
 */
export const Route = createFileRoute("/_pomodoro/u/$handle_/$year")({
  loader: async ({ params }) => {
    const handle = params.handle.toLowerCase()
    if (!isHandleAvailableShape(handle)) throw notFound()
    // Four digits and nothing else, checked before the number is parsed:
    // `Number("2026abc")` is NaN but `Number(" 2026 ")` is 2026, and an
    // address with a space in it is not this page's address.
    if (!/^\d{4}$/.test(params.year)) throw notFound()
    const review = await readYearInReview(handle, Number(params.year))
    if (!review) throw notFound()
    return { review }
  },
  errorComponent: routeErrorComponent(
    () => "This year could not be loaded. Reload to try again."
  ),
  component: YearInReviewRoute,
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { review } = loaderData
    return {
      meta: [
        { title: `${review.name} in ${review.year}` },
        {
          name: "description",
          content: review.tooEarly
            ? `${review.name}'s ${review.year} is not finished yet.`
            : `${review.name} focused for ${review.focusHours} hours across ${review.focusSessions} sessions in ${review.year}.`,
        },
      ],
    }
  },
})

function YearInReviewRoute() {
  const { review } = Route.useLoaderData()
  return <YearInReviewPage review={review} />
}
