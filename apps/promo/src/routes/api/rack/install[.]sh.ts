import { createFileRoute } from "@tanstack/react-router"

import { plainFile } from "@/server/phones/rack-http"
import { rackInstallScript, rackServerAddress } from "@/server/phones/release"

/**
 * The one command's script. Public, because it holds nothing secret: the
 * one-time code is typed after it, and the program pairs itself with that.
 */
export const Route = createFileRoute("/api/rack/install.sh")({
  server: {
    handlers: {
      GET: () => plainFile(rackInstallScript(rackServerAddress()), "text/x-shellscript; charset=utf-8"),
    },
  },
})
