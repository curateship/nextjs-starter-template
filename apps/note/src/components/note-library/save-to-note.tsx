import * as React from "react"
import { BookmarkIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { loadSaveKey } from "@/lib/api/note/imports"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { showErrorToast } from "@/lib/toast/error-toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The address a saved link is sent to: this app's Library screen with this
 * person's own key (`src/server/note/library/save-key.ts`), so only a button
 * or Shortcut made for them can save into their library. The link to save
 * goes on the end.
 */
function useSaveAddress() {
  const [address, setAddress] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    loadSaveKey()
      .then((key) => {
        if (live) setAddress(`${window.location.origin}/library?key=${key}&save=`)
      })
      .catch((error) => {
        if (live) setFailure(getLibraryErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [])
  return { address, failure }
}

/**
 * "Save to Note": a button dragged to the browser's bookmarks bar once
 * (Tyler, 19 Oct 2026: "Bookmark button"). Clicked on a YouTube, Instagram,
 * TikTok, X, LinkedIn, Facebook or Reddit page, it opens this app's Library
 * screen in a new tab with that page's address, and the screen imports it
 * into the library opened last. It sends only the address of the page it was
 * clicked on, and only to this site. Works in Arc and Chrome.
 *
 * The address is a `javascript:` one, which React refuses to write into an
 * `href`, so it is set on the element once it is on the page.
 */
export function SaveToNoteButton() {
  const link = React.useRef<HTMLAnchorElement>(null)
  const { address, failure } = useSaveAddress()

  React.useEffect(() => {
    if (!address) return
    link.current?.setAttribute(
      "href",
      `javascript:(()=>{window.open(${JSON.stringify(address)}+encodeURIComponent(location.href),"_blank")})()`
    )
  }, [address])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          ref={link}
          draggable
          className={cn(buttonVariants({ variant: "outline" }), "w-full cursor-grab")}
          onClick={(event) => {
            // Clicked here rather than on a post: there is nothing on this page to save.
            event.preventDefault()
            if (failure) showErrorToast(failure)
            else toast.info("Drag this button to your bookmarks bar, then click it on a post or a video.")
          }}
        >
          <BookmarkIcon />
          Save to Note
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Drag this to your bookmarks bar. On a post or a video, click it and the link is imported here.
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Saving from an iPhone (Tyler, 20 Oct 2026: "iPhone"). An iPhone does not
 * let a website appear in its Share menu, so an Apple Shortcut does it: it
 * takes the shared link and opens the same address the bookmark button opens.
 * These are the steps to make one, with this person's own address to paste.
 */
export function IphoneShortcutSteps() {
  const { address, failure } = useSaveAddress()

  async function copy() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast.success("Address copied.")
    } catch {
      showErrorToast("This browser would not copy. Select the address and copy it by hand.")
    }
  }

  return (
    <div className="grid gap-4">
      <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
        <li>On your iPhone, open Shortcuts, tap +, and name the shortcut Save to Note.</li>
        <li>Tap the ⓘ at the bottom, turn on Show in Share Sheet, and let it take URLs and Safari web pages.</li>
        <li>Add the action URL Encode, and set its input to Shortcut Input.</li>
        <li>Add the action Text. Paste the address below into it, then put URL Encoded Text right after it.</li>
        <li>Add the action Open URLs, set to that Text.</li>
        <li>In YouTube, Instagram, TikTok, X, LinkedIn, Facebook or Reddit, tap Share, then Save to Note.</li>
      </ol>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="note-shortcut-address"
          hint="It holds a key made for your account. Anyone with it can save links into your library, so keep it to yourself."
        >
          Your address
        </FieldLabel>
        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : (
          <div className="flex gap-2">
            <Input id="note-shortcut-address" readOnly value={address ?? ""} placeholder="Loading…" className="font-mono text-xs" />
            <Button type="button" variant="outline" disabled={!address} onClick={() => void copy()}>
              <CopyIcon />
              Copy
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
