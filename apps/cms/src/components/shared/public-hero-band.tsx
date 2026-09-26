import * as React from "react"

import { usePublicTheme } from "@/lib/branding"

/**
 * The band at the top of a public browse page: the directory's and the Events
 * page's. It holds the page's name, the line under it and the one bar a
 * visitor searches with.
 *
 * **The band runs the whole width of the window** and sits flush under the
 * header, so it reads as the top of the page rather than as a card on it. It
 * is drawn inside the page's own column, which is 1152px and centred, so it
 * has to climb back out. `self-center` is how: a child wider than its column
 * and centred on it spills the same amount either side, and the column is
 * itself centred in the window, so the band lands flush against both edges.
 * It works whether or not the site centres its public text, which a left or
 * right offset would not. The lift under the header is the page's own top
 * spacing from Settings → Styling, not a number written here.
 *
 * Nothing in it names a colour. A site that changed its spacing or its
 * palette gets those here too.
 */
export function PublicHeroBand({ children }: { children: React.ReactNode }) {
  const theme = usePublicTheme()
  const bleed = useWindowWidth()

  return (
    /*
     * `text-left` for the same reason the page's column has it: a site's
     * Styling settings can centre its public text, which is right for a page
     * of marketing and wrong for a list of records. The band sits outside that
     * column, so it has to say so itself.
     */
    <section
      // No bottom margin of its own: the page's column already puts its own
      // spacing between the band and what follows, and adding 24px on top of
      // that left the chip row stranded 52px under the band and 12px above the
      // cards it filters.
      className="self-center border-b bg-muted/60 py-10 text-left md:py-14"
      style={{
        width: bleed,
        // The page's top spacing, cancelled, so the band starts where the
        // header ends. Read from the site's settings, because a site that
        // widened its spacing would otherwise get a strip of background above
        // a band that is meant to be the top of the page.
        marginTop: -theme.mainSpacing,
        // Dots rather than a flat fill, at a twentieth of the text colour, so
        // the pattern follows a site into dark mode instead of being a grey
        // nobody chose.
        backgroundImage:
          "radial-gradient(color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 0)",
        backgroundSize: "16px 16px",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
        {children}
      </div>
    </section>
  )
}

/**
 * The bar inside the band: one row on desktop, a stack on a phone. The
 * directory and the Events page both put their boxes in it, so the two bars
 * are the same height and the same shadow without either page saying so.
 */
export function PublicHeroBar({
  children,
  onSubmit,
}: {
  children: React.ReactNode
  onSubmit: () => void
}) {
  return (
    /*
     * A form, so Enter runs the search from whichever box the visitor is in.
     */
    <form
      className="flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-lg shadow-foreground/5 md:flex-row md:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

/** The hairline between two parts of the bar, which a phone does not draw. */
export function PublicHeroBarDivider() {
  return (
    <div className="hidden self-stretch border-l md:block" aria-hidden="true" />
  )
}

/**
 * The window's width without its scrollbar.
 *
 * `100vw` counts the scrollbar on Windows, and a band that wide adds a
 * sideways scroll to every page it is on. `clientWidth` is the number
 * `100vw` should have been, and it can only be read in a browser, so `100vw`
 * is what the server draws and the exact number replaces it on arrival. On a
 * Mac, where the scrollbar floats over the page, the two are the same and
 * nothing moves.
 */
function useWindowWidth() {
  const [width, setWidth] = React.useState("100vw")
  React.useEffect(() => {
    const measure = () => setWidth(`${document.documentElement.clientWidth}px`)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  return width
}
