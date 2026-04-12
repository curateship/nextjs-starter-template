import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@/styles.css"
import { ThemeProvider } from "@/components/light-dark-switcher"
import { TooltipProvider } from "@/components/ui/tooltip"

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
