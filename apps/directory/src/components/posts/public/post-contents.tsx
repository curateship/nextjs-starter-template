import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { focusRing } from "@/lib/layout/focus-ring"
import type { PostHeading } from "@/lib/posts/post-headings"
import { cn } from "@/lib/utils"

/**
 * The contents list beside a post: one line per top-level heading, and the
 * heading the visitor is reading marked as they scroll.
 *
 * The ids come from `postHeadings`, the same function the body draws its
 * headings with, so a link here always has something to land on.
 *
 * Which line is marked is worked out from where the headings sit in the
 * window rather than from an IntersectionObserver, because the answer wanted
 * is "the last heading the visitor has passed". An observer answers "which
 * headings are on screen", which is a different question and leaves nothing
 * marked while a long section fills the window.
 */
export function PostContents({ headings }: { headings: PostHeading[] }) {
  const [activeId, setActiveId] = React.useState(headings[0]?.id ?? "")

  React.useEffect(() => {
    if (headings.length === 0) return

    const read = () => {
      const marks = headings
        .map((heading) => document.getElementById(heading.id))
        .filter((element): element is HTMLElement => element !== null)
      if (marks.length === 0) return

      // At the very bottom of the page the last heading is the one being read,
      // even when it is above the line below. Without this the final short
      // section could never be marked.
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 4
      if (atBottom) {
        setActiveId(marks[marks.length - 1]!.id)
        return
      }

      const passed = [...marks]
        .reverse()
        .find((mark) => mark.getBoundingClientRect().top <= 120)
      setActiveId(passed?.id ?? marks[0]!.id)
    }

    // The first read waits for the browser's next frame rather than running
    // during the effect. The page has just been laid out, and a visitor who
    // arrived on a link ending in `#a-heading` is still being scrolled there.
    const first = window.requestAnimationFrame(read)
    window.addEventListener("scroll", read, { passive: true })
    // `scrollend` as well as `scroll`, because a browser animating a long
    // scroll can send its last `scroll` a frame before the page settles, and
    // then the line being read at the bottom of the page is never marked. A
    // browser without `scrollend` simply never sends one.
    window.addEventListener("scrollend", read)
    window.addEventListener("resize", read)
    return () => {
      window.cancelAnimationFrame(first)
      window.removeEventListener("scroll", read)
      window.removeEventListener("scrollend", read)
      window.removeEventListener("resize", read)
    }
  }, [headings])

  if (headings.length === 0) return null

  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="text-lg font-semibold">On this page</h2>
        <nav aria-label="On this page">
          {/* Capped so a post with twenty headings scrolls its own list
              instead of running off the bottom of the window, which is where
              a sticky column would otherwise leave it. */}
          <ol className="grid gap-2 lg:max-h-[calc(100svh-12rem)] lg:overflow-y-auto">
            {headings.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  aria-current={activeId === heading.id ? "true" : undefined}
                  className={cn(
                    "block border-l-2 border-transparent pl-3 text-sm leading-snug text-muted-foreground hover:text-foreground",
                    focusRing,
                    activeId === heading.id &&
                      "border-primary font-medium text-foreground"
                  )}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </CardContent>
    </Card>
  )
}
