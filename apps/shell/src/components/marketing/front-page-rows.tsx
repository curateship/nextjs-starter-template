import type { CSSProperties } from "react"
import {
  FrontPageDivider,
  FrontPageFaq,
  FrontPageHero,
  FrontPageListedPages,
  FrontPageLogos,
  FrontPageScreenshots,
  FrontPageTestimonials,
} from "@/components/marketing/front-page-content-blocks"
import { AppFrontPageRow } from "@/components/marketing/app-front-page-row"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import { SavedLink } from "@/components/shell/public-navigation"
import { Button } from "@/components/ui/button"
import {
  publicContentAlignmentGridClassName,
  publicContentAlignmentJustifyClassNames,
  publicContentAlignmentRowClassName,
  publicContentAlignmentSelfClassNames,
} from "@/components/shell/public-content-alignment"
import { PricingTable } from "@/components/shared/pricing-table"
import type { PlanOption } from "@/lib/api/billing/billing"
import type { BillingInterval } from "@/lib/billing/pricing-choice"
import {
  APP_FRONT_PAGE_ROW_KIND,
  frontPageHeroBandColors,
  type FrontPageListedPage,
  type FrontPageRow,
} from "@/lib/pages/front-page"
import { publicDeviceRowClassName } from "@/lib/pages/public-device"
import { PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE } from "@/lib/public-theme"
import { cn } from "@/lib/utils"

/**
 * The button an app's row puts beside its heading, when it named one.
 *
 * What an app fills its row with is opaque to the shell — it hands it to the
 * app's own component and never opens it — with this one exception, so the
 * button sits in the shell's header beside the heading rather than each app
 * drawing a heading of its own to hang it on. An app that names none gets a
 * plain heading, which is every row that is not a handful of a longer list.
 */
function frontPageRowAction(
  data: unknown
): { label: string; href: string } | null {
  if (!data || typeof data !== "object") return null
  const action = (data as { action?: unknown }).action
  if (!action || typeof action !== "object") return null
  const { label, href } = action as { label?: unknown; href?: unknown }
  return typeof label === "string" &&
    label.trim() &&
    typeof href === "string" &&
    href.trim()
    ? { label, href }
    : null
}

/**
 * A row's own air, as the two variables theme.css picks between.
 *
 * It cannot be one inline `margin-block`, for the reason the hero's spacing
 * cannot be one inline `padding-block`: an inline value beats a media query,
 * so a number written here could never be smaller on a phone. A side the block
 * has not set writes nothing at all, and theme.css falls back to half the
 * page's own Space between blocks.
 */
function rowSpaceStyle(row: FrontPageRow): CSSProperties | undefined {
  const sides: Record<string, string> = {}
  if (row.spaceAbove !== null) {
    sides["--shell-row-space-above"] = `${row.spaceAbove}px`
    sides["--shell-row-space-above-phone"] = `${Math.round(
      row.spaceAbove * PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE
    )}px`
  }
  if (row.spaceBelow !== null) {
    sides["--shell-row-space-below"] = `${row.spaceBelow}px`
    sides["--shell-row-space-below-phone"] = `${Math.round(
      row.spaceBelow * PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE
    )}px`
  }
  return Object.keys(sides).length ? (sides as CSSProperties) : undefined
}

export function FrontPageRows({
  rows,
  plans,
  trialUsed,
  interval,
  onIntervalChange,
  onSelectPlan,
  appRowData,
  listedPages,
}: {
  rows: FrontPageRow[]
  /**
   * The public plans, and everything the plans block needs to offer them.
   *
   * Left out by a page that cannot hold a plans block — every page but the
   * front page — so the caller does not have to load billing for a block it
   * will never draw. A plans block without them draws nothing rather than an
   * empty table.
   */
  plans?: PlanOption[]
  trialUsed?: boolean
  interval?: BillingInterval
  onIntervalChange?: (interval: BillingInterval) => void
  onSelectPlan?: (plan: PlanOption, interval: BillingInterval) => void
  /**
   * What the app's own reader filled for each of its rows, by row id. A page
   * drawn without asking the app — a preview, or an app with no such rows —
   * passes none, and every app row is handed `null`.
   */
  appRowData?: Record<string, unknown>
  /**
   * The cards each Pages list block shows, by row id, read from the pages
   * themselves on the server. A page drawn without them draws every Pages
   * list block as its heading alone.
   */
  listedPages?: Record<string, FrontPageListedPage[]>
}) {
  // A divider has no words, so it is not the row that carries the page's main
  // heading. Counting past it keeps the h1 on the first row that actually says
  // something, even when a divider opens the page. -1 when every row is a
  // divider, which matches no index and leaves the page with no h1 to give.
  const firstSpeakingRow = rows.findIndex((row) => row.kind !== "divider")

  return (
    <div
      // The space between rows is set in theme.css, so flat mode can collapse
      // it and a phone and a desktop can have different ones. It is each row's
      // own margin rather than this grid's `gap`, because a gap belongs to the
      // container and a block has to be able to name its own.
      className={cn("grid w-full", publicContentAlignmentGridClassName)}
      data-front-page-rows=""
    >
      {rows.map((row, index) => {
        const first = index === firstSpeakingRow
        const Heading = first ? "h1" : "h2"
        // The first row is what a visitor sees before scrolling, so its
        // pictures load with the page. Every row after it waits to be reached.
        const eager = index === 0
        // A row either follows the site's content alignment, in which case its
        // children read it off the public content column, or it sets its own,
        // in which case it places itself in that column too.
        const alignment = row.alignment === "inherit" ? null : row.alignment
        const alignClassName = alignment
          ? publicContentAlignmentJustifyClassNames[alignment]
          : publicContentAlignmentRowClassName
        const showHeading = row.showHeading
        const showIntro = Boolean(row.intro) && row.showIntro
        // The way to everything this row shows a handful of, drawn beside the
        // heading. An app names it in what it fills the row with, because only
        // the app knows where its own list lives and what it is called.
        const rowAction =
          row.kind === APP_FRONT_PAGE_ROW_KIND
            ? frontPageRowAction(appRowData?.[row.id])
            : null

        // A hero's own colour, painted as a band right across the window. The
        // band is a child rather than a background on the section itself,
        // because the section is only as wide as its layout allows and the
        // colour has to reach both edges of the window whatever that is.
        const background = row.kind === "hero" ? row.background : ""
        // One colour for light mode and one for dark. A muted grey has a real
        // pair; a fixed hex is the same colour twice.
        const bandColors = frontPageHeroBandColors(background)
        // Only the row at the very top of the page has the menu over it,
        // whatever a hero further down has saved.
        const underMenu =
          index === 0 &&
          row.kind === "hero" &&
          Boolean(row.background) &&
          row.backgroundUnderMenu

        // A whole-screen row steps outside the public content column and the
        // page's own left and right edge. The column is centred inside `main`,
        // so half the window less half the column is exactly the distance to
        // each edge, and `100vw` is the window. `main` clips what is left so
        // the window never scrolls sideways.
        //
        // `justify-self-center` pins that: the site's content alignment sets
        // `justify-items` on this grid, and the row has to land in the same
        // place whichever of the three it is.
        //
        // The 16px edge comes back as padding, because a heading that runs
        // from one side of a 1440px window to the other is not readable. A
        // divider has no words, so its line keeps the whole width.
        const whole = row.layout === "full"
        const wholeClassName = whole
          ? cn(
              "w-screen max-w-none justify-self-center mx-[calc(50%-50vw)]",
              row.kind === "divider" ? null : "px-4"
            )
          : null

        return (
          <section
            key={row.id}
            className={cn(
              // The row's words and the row's content are two things, not
              // one, so they sit further apart than the lines inside either.
              "flex w-full flex-col gap-6 md:gap-8",
              row.layout === "narrow" && "max-w-3xl",
              alignment ? publicContentAlignmentSelfClassNames[alignment] : null,
              wholeClassName,
              // `isolate` keeps the band behind this row's own words and
              // nothing else. Without it the band's negative layer would drop
              // behind the page's canvas colour and disappear.
              //
              // No padding here. The hero decides how much air it wants above
              // and below itself, and the band covers the whole row, that air
              // included.
              background ? "relative isolate" : null,
              publicDeviceRowClassName(row.device)
            )}
            style={rowSpaceStyle(row)}
            data-front-page-row={row.kind}
            data-front-page-layout={row.layout}
            data-front-page-device={row.device}
            data-front-page-alignment={row.alignment}
          >
            {/* The colour itself. It runs 100vw past each side rather than
                measuring the window, because the row may sit left, right or
                centred and only one of those has the window's middle under
                it. `main` has `overflow-x-clip`, so the spill is cut off at
                the window and never adds a sideways scrollbar.

                With the switch on it also climbs past the menu, so the
                colour is what shows through it. How far that is — the gap
                above this row plus the bar's own height — is `--shell-hero-rise`,
                which the public page frame writes on `main`. */}
            {background ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -z-10 right-[-100vw] bottom-0 left-[-100vw]"
                // The band carries a colour for each mode rather than one
                // `backgroundColor`, because an inline background cannot
                // change when the page turns dark. `theme.css` picks between
                // the two off `data-hero-band`.
                data-hero-band=""
                style={
                  {
                    "--shell-hero-band-light": bandColors.light,
                    "--shell-hero-band-dark": bandColors.dark,
                    top: underMenu
                      ? "calc(-1 * var(--shell-hero-rise, 0px))"
                      : 0,
                  } as CSSProperties
                }
              />
            ) : null}

            {/* A hero draws its own heading, at its own size and beside the
                picture. A divider has no words at all. Every other row puts the
                heading above its content. */}
            {row.kind === "hero" ||
            row.kind === "divider" ||
            (!showHeading && !showIntro && !rowAction) ? null : (
              <header
                className={cn(
                  "flex w-full flex-wrap items-end justify-between gap-4",
                  // The button sits at the end of the heading's line, so the
                  // row reads as one band: what it is on the left, the way to
                  // all of it on the right.
                  rowAction ? null : "block"
                )}
              >
                <div className="grid gap-2">
                  {showHeading ? (
                    <Heading
                      className={cn(
                        "font-semibold tracking-tight text-balance",
                        first
                          ? "text-3xl md:text-4xl"
                          : "text-2xl md:text-3xl"
                      )}
                    >
                      {row.heading}
                    </Heading>
                  ) : null}
                  {showIntro ? (
                    <p className="text-base text-muted-foreground md:text-lg">
                      {row.intro}
                    </p>
                  ) : null}
                </div>
                {rowAction ? (
                  <Button asChild className="shrink-0">
                    <SavedLink href={rowAction.href}>
                      {rowAction.label}
                    </SavedLink>
                  </Button>
                ) : null}
              </header>
            )}

            {row.kind === APP_FRONT_PAGE_ROW_KIND ? (
              // The heading above it is the shell's, like every other kind but
              // a hero, so an app row answers to the same Visibility switches
              // and the same alignment as the rows around it.
              <AppFrontPageRow
                appKind={row.appKind}
                heading={row.heading}
                intro={row.intro}
                settings={row.settings}
                data={appRowData?.[row.id] ?? null}
              />
            ) : row.kind === "hero" ? (
              <FrontPageHero
                heading={row.heading}
                intro={row.intro}
                action={row.action}
                image={row.showImage ? row.image : ""}
                alt={row.alt}
                buttonLabel={row.buttonLabel}
                buttonHref={row.buttonHref}
                note={row.note}
                stars={row.stars}
                headingLevel={first ? "h1" : "h2"}
                eager={eager}
                alignClassName={alignClassName}
                showHeading={showHeading}
                showIntro={showIntro}
                showAction={row.showAction}
                showStars={row.showStars}
                showNote={row.showNote}
                spacing={row.spacing}
              />
            ) : row.kind === "plans" ? (
              plans && interval && onIntervalChange && onSelectPlan ? (
                <PricingTable
                  plans={plans}
                  interval={interval}
                  onIntervalChange={onIntervalChange}
                  onSelect={onSelectPlan}
                  trialUsed={trialUsed ?? false}
                  actionLabel="Get started"
                />
              ) : null
            ) : row.kind === "testimonials" ? (
              <FrontPageTestimonials
                items={row.items}
                alignClassName={alignClassName}
                showPictures={row.showPictures}
                showRoles={row.showRoles}
              />
            ) : row.kind === "faq" ? (
              <FrontPageFaq items={row.items} showNumbers={row.showNumbers} />
            ) : row.kind === "logos" ? (
              <FrontPageLogos
                items={row.items}
                eager={eager}
                alignClassName={alignClassName}
              />
            ) : row.kind === "screenshots" ? (
              <FrontPageScreenshots
                items={row.items}
                eager={eager}
                alignClassName={alignClassName}
                showCaptions={row.showCaptions}
              />
            ) : row.kind === "pages" ? (
              <FrontPageListedPages
                pages={listedPages?.[row.id] ?? []}
                eager={eager}
              />
            ) : row.kind === "words" ? (
              /* The words a page is written in, drawn from the same node tree
                 a written page always used. Nothing in it is markup, so there
                 is no string to sanitise on the way to the browser. */
              <div className={cn("w-full", alignClassName)}>
                <WrittenPageBody body={row.body} />
              </div>
            ) : row.kind === "divider" ? (
              <FrontPageDivider
                style={row.dividerStyle}
                shade={row.dividerShade}
                space={row.dividerSpace}
                alignClassName={alignClassName}
              />
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
