import { createFileRoute } from "@tanstack/react-router"

import { plainFile } from "@/server/phones/rack-http"
import { rackProgramSource } from "@/server/phones/release"

/**
 * The rack program's first copy, downloaded by the install command over
 * HTTPS before the rack has a key. Every later version comes signed through
 * /api/rack/release.
 */
export const Route = createFileRoute("/api/rack/program.py")({
  server: {
    handlers: {
      GET: () => plainFile(rackProgramSource(), "text/x-python; charset=utf-8"),
    },
  },
})
