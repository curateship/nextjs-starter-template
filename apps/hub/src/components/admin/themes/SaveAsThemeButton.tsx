"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Paintbrush } from "lucide-react"
import { SaveAsThemeDialog } from "./SaveAsThemeDialog"

interface SaveAsThemeButtonProps {
  siteId: string
  siteName: string
  className?: string
  variant?: "default" | "outline" | "ghost"
  fullWidth?: boolean
}

export function SaveAsThemeButton({
  siteId,
  siteName,
  className,
  variant = "outline",
  fullWidth = false,
}: SaveAsThemeButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setOpen(true)}
        className={fullWidth ? `w-full justify-start ${className || ""}` : className}
      >
        <Paintbrush className="mr-2 h-4 w-4" />
        Save as Theme
      </Button>

      <SaveAsThemeDialog
        siteId={siteId}
        siteName={siteName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
