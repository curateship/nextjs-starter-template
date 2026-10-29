import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app"
import { TooltipProvider } from "@/components/ui/tooltip"
import { startColourMode } from "@/lib/colour-mode"
import "@/styles.css"

// Light, dark, or the Mac's own setting, as picked in the cog.
startColourMode()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Closes a tooltip the moment the pointer leaves its button. Otherwise it waits to
        see the pointer move on, and a pointer that moved into the app in the middle
        frame is never seen again, so the tooltip stayed up. */}
    <TooltipProvider disableHoverableContent>
      <App />
    </TooltipProvider>
  </StrictMode>
)
