import { createFileRoute } from "@tanstack/react-router"

import { CopyrightPage } from "@/components/pomodoro/copyright-page"

/**
 * The public copyright page (uploads-and-sharing task 05, part 6). Open to
 * everybody, inside the product shell like the public profiles it is about.
 */
export const Route = createFileRoute("/_pomodoro/copyright")({
  component: CopyrightPage,
  head: () => ({
    meta: [
      { title: "Copyright · Pomoder" },
      {
        name: "description",
        content: "Ask for a shared sound or background that copies your work to be taken down.",
      },
    ],
  }),
})
