import { createFileRoute } from "@tanstack/react-router"

import { plainFile } from "@/server/phones/rack-http"
import { rackLauncherSource } from "@/server/phones/release"

/** The launcher the install command downloads. Public, like the script. */
export const Route = createFileRoute("/api/rack/launcher.py")({
  server: {
    handlers: {
      GET: () => plainFile(rackLauncherSource(), "text/x-python; charset=utf-8"),
    },
  },
})
