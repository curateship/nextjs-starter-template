import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@repo/admin-shell/styles.css"
import { ThemeProvider, TooltipProvider } from "@repo/admin-shell"

import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
