import { createFileRoute } from "@tanstack/react-router"

import { plainFile } from "@/server/phones/rack-http"
import { rackDriverSource } from "@/server/phones/release"

/**
 * The iPhone driver's first copy, downloaded by the install command beside
 * the program. Every later copy comes inside the signed release.
 */
export const Route = createFileRoute("/api/rack/iphone.py")({
  server: {
    handlers: {
      GET: () => plainFile(rackDriverSource(), "text/x-python; charset=utf-8"),
    },
  },
})
