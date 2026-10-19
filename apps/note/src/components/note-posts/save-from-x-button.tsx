import * as React from "react"
import { BookmarkIcon } from "lucide-react"
import { toast } from "sonner"

import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * "Save from x.com": a button dragged to the browser's bookmarks bar once
 * (Tyler, 19 Oct 2026: "Bookmark button"). Clicked on an X post, it opens
 * this app's Posts screen in a new tab with that post's address, and the
 * screen saves it as if it had been pasted. It sends only the address of the
 * page it was clicked on, and only to this site. Works in Arc and Chrome.
 *
 * The address is a `javascript:` one, which React refuses to write into an
 * `href`, so it is set on the element once it is on the page.
 */
export function SaveFromXButton() {
  const link = React.useRef<HTMLAnchorElement>(null)

  React.useEffect(() => {
    const target = `${window.location.origin}/posts?save=`
    link.current?.setAttribute(
      "href",
      `javascript:(()=>{window.open(${JSON.stringify(target)}+encodeURIComponent(location.href),"_blank")})()`
    )
  }, [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          ref={link}
          draggable
          className={cn(buttonVariants({ variant: "outline" }), "w-full cursor-grab")}
          onClick={(event) => {
            // Clicked here rather than on x.com: there is no post on this page to save.
            event.preventDefault()
            toast.info("Drag this button to your bookmarks bar, then click it on any X post.")
          }}
        >
          <BookmarkIcon />
          Save from x.com
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Drag this to your bookmarks bar. On an X post, click it and the post is saved here.
      </TooltipContent>
    </Tooltip>
  )
}
