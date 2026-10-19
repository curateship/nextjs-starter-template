import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { FileTextIcon, StarIcon } from "lucide-react"

import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { SavedLink } from "@/components/shell/public-navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  MAX_CARRIED_EMAIL_LENGTH,
} from "@/lib/billing/pricing-choice"
import { pageGutter } from "@/lib/layout/shell-gutter"
import {
  DEFAULT_FRONT_PAGE_HERO_SPACING,
  FRONT_PAGE_HERO_SPACING_PHONE_SHARE,
  frontPageDividerColor,
  MAX_FRONT_PAGE_HERO_STARS,
  type FrontPageDividerStyle,
  type FrontPageHeroAction,
  type FrontPageFaqItem,
  type FrontPageListedPage,
  type FrontPageLogo,
  type FrontPageScreenshot,
  type FrontPageTestimonial,
} from "@/lib/pages/front-page"
import { PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE } from "@/lib/public-theme"
import { cn } from "@/lib/utils"

/**
 * The hero's own air, as the two numbers theme.css picks between at the
 * breakpoint. It cannot be one inline `padding-block`, because an inline
 * value beats a media query and a phone could then never draw less than a
 * desktop. Left at the default, nothing is written and theme.css keeps its
 * own fallbacks.
 */
function heroSpacingStyle(spacing: number): React.CSSProperties | undefined {
  if (spacing === DEFAULT_FRONT_PAGE_HERO_SPACING) return undefined
  return {
    "--shell-hero-space": `${spacing}px`,
    "--shell-hero-space-phone": `${Math.round(
      spacing * FRONT_PAGE_HERO_SPACING_PHONE_SHARE
    )}px`,
  } as React.CSSProperties
}

/**
 * The hero's address box: one pill holding the box and its button.
 *
 * Nothing is stored here. The address travels to the register page and lands
 * in its email box, so somebody who typed it on the front page does not type
 * it again. Registering is what creates the person.
 *
 * **The box fills the pill, rather than sitting as a line of text inside it.**
 * The pill is 448 by 58 and the box used to be 285 by 20, which is 22% of what
 * looks like one control: a click 8px in from the left edge, or 4px under the
 * top edge, landed on the form and did nothing. The box is now the pill's full
 * inner height and carries the left inset itself, so every pixel from the
 * border to the button is live. The button keeps its 6px frame through the
 * form's `pr-1.5` and the `gap-2` between the two.
 *
 * **The pill carries the focus ring**, because the pill is what reads as the
 * field. It is the ring every other control draws, written with
 * `focus-within` rather than taken from `focusRing`: focus lands on the box
 * inside and the ring has to appear around the pill around it. Until this the
 * focused field drew nothing at all, so a keyboard had no way to say where it
 * was.
 */
function HeroEmailForm({ buttonLabel }: { buttonLabel: string }) {
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")

  return (
    <form
      className="flex w-full max-w-md items-center gap-2 rounded-full border border-foreground/15 bg-background pr-1.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      onSubmit={(event) => {
        event.preventDefault()
        void navigate({ to: "/register", search: { email } })
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Enter your email"
        aria-label="Your email address"
        maxLength={MAX_CARRIED_EMAIL_LENGTH}
        // `h-14` is the pill's whole inner height, so there is no band above
        // or below the box that looks like the field and is not. `pl-5` is
        // the inset the form used to hold, which keeps the text exactly where
        // it has always been, 20px from the pill's edge.
        className="h-14 min-w-0 flex-1 bg-transparent pl-5 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="submit"
        size="lg"
        className="h-11 shrink-0 rounded-full px-6 text-base"
      >
        {buttonLabel}
      </Button>
    </form>
  )
}

/**
 * The top of a front page: a large heading, a line beneath it, a button, and a
 * short line of proof. A chosen picture puts all of that in a left column and
 * the picture in a right one; without a picture the words run across the page.
 * A phone stacks them either way, words first.
 */
export function FrontPageHero({
  heading,
  intro,
  action,
  image,
  alt,
  buttonLabel,
  buttonHref,
  note,
  stars,
  headingLevel,
  eager = false,
  alignClassName = publicContentAlignmentRowClassName,
  showHeading = true,
  showIntro = true,
  showAction = true,
  showStars = true,
  showNote = true,
  spacing = DEFAULT_FRONT_PAGE_HERO_SPACING,
}: {
  heading: string
  intro: string
  action: FrontPageHeroAction
  image: string
  alt: string
  buttonLabel: string
  buttonHref: string
  note: string
  stars: number
  headingLevel: "h1" | "h2"
  eager?: boolean
  /** How the row lines up its own children. See `FrontPageRows`. */
  alignClassName?: string
  showHeading?: boolean
  showIntro?: boolean
  showAction?: boolean
  showStars?: boolean
  showNote?: boolean
  /** The air above and below, on a desktop, in pixels. */
  spacing?: number
}) {
  const Heading = headingLevel
  const shownStars = showStars ? stars : 0
  const shownNote = showNote ? note : ""
  const words = (
    <div
      data-front-page-hero={image ? undefined : ""}
      style={image ? undefined : heroSpacingStyle(spacing)}
      className={cn(
        "grid gap-6",
        // Long lines are hard to read, so the words stop short of the full
        // page even when no picture is taking the other half.
        image ? "w-full" : "w-full max-w-3xl"
      )}
    >
      <div className="grid gap-4">
        {showHeading ? (
          <Heading
            className={cn(
              "font-normal tracking-tight text-balance",
              image
                ? "text-3xl leading-[1.1] md:text-5xl"
                : "text-4xl leading-[1.05] md:text-6xl"
            )}
          >
            {heading}
          </Heading>
        ) : null}
        {intro && showIntro ? (
          <p className="text-base text-muted-foreground md:text-lg">{intro}</p>
        ) : null}
      </div>

      {!showAction ? null : action === "email" && buttonLabel ? (
        <div className={cn("flex w-full", alignClassName)}>
          <HeroEmailForm buttonLabel={buttonLabel} />
        </div>
      ) : action === "button" && buttonLabel && buttonHref ? (
        <div className={cn("flex w-full", alignClassName)}>
          <Button asChild size="lg" className="h-11 px-6 text-base">
            <SavedLink href={buttonHref}>{buttonLabel}</SavedLink>
          </Button>
        </div>
      ) : null}

      {shownStars > 0 || shownNote ? (
        <div
          className={cn(
            "flex w-full flex-wrap items-center gap-2",
            alignClassName
          )}
        >
          {shownStars > 0 ? (
            <span
              className="flex items-center gap-0.5"
              aria-label={`Rated ${shownStars} out of ${MAX_FRONT_PAGE_HERO_STARS}`}
            >
              {Array.from({ length: shownStars }, (_, index) => (
                <StarIcon
                  key={index}
                  aria-hidden="true"
                  className="size-4 fill-amber-400 text-amber-400"
                />
              ))}
            </span>
          ) : null}
          {shownNote ? (
            <span className="text-sm text-muted-foreground">{shownNote}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (!image) return words

  return (
    <div
      data-front-page-hero=""
      style={heroSpacingStyle(spacing)}
      className="grid w-full gap-6 md:grid-cols-2 md:items-start md:gap-10"
    >
      {words}
      {/* The picture keeps its own shape. It used to sit in a 16:9 box set to
        `contain`, so anything that was not 16:9 was drawn small in the middle
        with grey bars either side of it. Now it fills the column's width and
        is as tall as its own shape makes it. */}
      <MediaThumbnail
        url={image}
        fileType="image"
        alt={alt}
        natural
        className="w-full overflow-hidden rounded-lg"
        // Half the reading width on desktop, the whole of it on a phone.
        sizes="(min-width: 768px) 50vw, 100vw"
        eager={eager}
      />
    </div>
  )
}

export function FrontPageTestimonials({
  items,
  alignClassName = publicContentAlignmentRowClassName,
  showPictures = true,
  showRoles = true,
}: {
  items: FrontPageTestimonial[]
  alignClassName?: string
  showPictures?: boolean
  showRoles?: boolean
}) {
  return (
    <div
      className={cn("flex w-full flex-wrap gap-2 md:gap-3", alignClassName)}
    >
      {items.map((item) => (
        <Card
          key={item.id}
          size="sm"
          className="w-full md:w-[calc(50%-0.375rem)]"
        >
          <CardContent className="grid h-full gap-4">
            <blockquote className="text-sm whitespace-pre-wrap">
              <p>{item.quote}</p>
            </blockquote>
            <div
              className={cn("flex items-center gap-2 self-end", alignClassName)}
            >
              {showPictures ? (
                <Avatar size="lg">
                  {item.picture ? (
                    // No `srcSet` here, deliberately. `AvatarImage` decides
                    // whether to show the initial instead by loading `src` on a
                    // bare `new Image()` first, and that pre-load cannot read a
                    // `srcSet`. Offering one downloads the uploaded file and
                    // then a smaller copy as well, which is worse than the
                    // uploaded file on its own.
                    <AvatarImage src={item.picture} alt={item.name} />
                  ) : null}
                  <AvatarFallback>{item.name.slice(0, 1)}</AvatarFallback>
                </Avatar>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.role && showRoles ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.role}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * Three columns of questions on a wide screen, two on a tablet and one on a
 * phone. Each card is numbered, so a visitor reading down a column can tell
 * where they are and can point at a question by its number.
 *
 * The card is the theme's muted surface rather than the shared `Card`, so it
 * is a light grey block with no edge in light mode and a dark grey one in
 * dark mode. A site that also sets its canvas to muted at full strength will
 * see less separation between the two.
 */
export function FrontPageFaq({
  items,
  showNumbers = true,
}: {
  items: FrontPageFaqItem[]
  showNumbers?: boolean
}) {
  return (
    <dl className="grid w-full gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="grid content-start gap-3 rounded-xl bg-muted p-6 md:p-7"
        >
          {showNumbers ? (
            <Badge variant="outline" className="bg-background">
              Q{index + 1}
            </Badge>
          ) : null}
          <dt className="font-medium">{item.question}</dt>
          <dd className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {item.answer}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function FrontPageLogos({
  items,
  eager = false,
  alignClassName = publicContentAlignmentRowClassName,
}: {
  items: FrontPageLogo[]
  eager?: boolean
  alignClassName?: string
}) {
  return (
    <Card size="sm" className="w-full">
      <CardContent
        className={cn("flex flex-wrap items-center gap-4", alignClassName)}
      >
        {items.map((item) => (
          <MediaThumbnail
            key={item.id}
            url={item.image}
            fileType="image"
            alt={item.alt}
            fit="contain"
            className="h-14 w-28 bg-muted/50"
            sizes="112px"
            eager={eager}
          />
        ))}
      </CardContent>
    </Card>
  )
}

export function FrontPageScreenshots({
  items,
  eager = false,
  alignClassName = publicContentAlignmentRowClassName,
  showCaptions = true,
}: {
  items: FrontPageScreenshot[]
  eager?: boolean
  alignClassName?: string
  showCaptions?: boolean
}) {
  return (
    <div
      className={cn("flex w-full flex-wrap gap-2 md:gap-3", alignClassName)}
    >
      {items.map((item) => (
        <Card
          key={item.id}
          size="sm"
          className="w-full md:w-[calc(50%-0.375rem)]"
        >
          <figure className="grid h-full gap-3">
            <MediaThumbnail
              url={item.image}
              fileType="image"
              alt={item.caption}
              fit="contain"
              className="aspect-video w-full bg-muted/50"
              // Two to a row on desktop, one to a row on a phone. The row is
              // inside the page's own reading width, so half the window is the
              // widest this ever gets.
              sizes="(min-width: 768px) 50vw, 100vw"
              eager={eager}
            />
            {showCaptions ? (
              <figcaption className="px-3 text-sm text-muted-foreground">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        </Card>
      ))}
    </div>
  )
}

/**
 * A Pages list block: one card per page, each a link to it.
 *
 * The card is the one Tyler drew on 6 Oct 2026: the page's picture across the
 * top, its name under it, and one grey line under that, which is the page's
 * own description. A page with no description shows its name alone, and one
 * with no picture keeps a plain grey panel in the picture's place, so the
 * cards in a row stay the same height.
 *
 * Three to a row on a wide screen, two on a tablet, one on a phone. The grid
 * runs the full width of the row, so the row's Alignment moves the heading
 * above it and not the cards.
 *
 * **The gap between the cards is Content spacing**, read through `pageGutter`,
 * which is what `theme.css` says that setting is: the space at the sides of
 * public content and between the cards in every grid on it. It was a fixed
 * 12px on a phone and 16px on a desktop until Tyler pointed at it on
 * 6 Oct 2026. A site asking for 40px of air got 16, and a site at 0, where no
 * card draws an edge at all, still had its cards standing 16px apart.
 */
export function FrontPageListedPages({
  pages,
  eager = false,
}: {
  pages: FrontPageListedPage[]
  eager?: boolean
}) {
  if (pages.length === 0) return null

  return (
    <ul
      className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      style={{ gap: pageGutter }}
    >
      {pages.map((page) => (
        <li key={page.id} className="min-w-0">
          <SavedLink
            href={page.path}
            className="group/page-card block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="h-full gap-0 py-0 text-left transition-shadow group-hover/page-card:ring-foreground/25">
              {page.image ? (
                <MediaThumbnail
                  url={page.image}
                  fileType="image"
                  // No fallback to the page's name: the heading under the
                  // picture already says it, and a link that reads its name
                  // out twice helps nobody. A picture with no name of its own
                  // is left as decoration.
                  alt={page.imageAlt}
                  fit="cover"
                  className="aspect-video w-full"
                  // A third of the window on a wide screen, half on a tablet
                  // and all of it on a phone, matching the grid above.
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  eager={eager}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground"
                >
                  <FileTextIcon className="size-6" />
                </div>
              )}
              <div className="grid gap-1 px-4 py-3">
                <h3 className="text-base font-medium text-balance md:text-lg">
                  {page.title}
                </h3>
                {page.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground md:text-base">
                    {page.description}
                  </p>
                ) : null}
              </div>
            </Card>
          </SavedLink>
        </li>
      ))}
    </ul>
  )
}

/**
 * A break between the rows around it.
 *
 * The line and the dots take the row's own Shade, not
 * Settings > Styling > Divider lines, so one break on the front page can be
 * stronger or fainter than the hairlines inside a card. The shade is a share of
 * `--muted-foreground`, the token the theme builds its own divider colour from,
 * so it still follows light and dark. A space draws nothing at all: the row is
 * there only for the gap it adds between its neighbours.
 *
 * Marked `aria-hidden`, because a divider says nothing a screen reader needs to
 * hear. The rows either side are already separate sections.
 */
export function FrontPageDivider({
  style,
  shade,
  space,
  alignClassName = publicContentAlignmentRowClassName,
}: {
  style: FrontPageDividerStyle
  shade: number
  space: number
  alignClassName?: string
}) {
  if (style === "space") {
    return (
      <div
        aria-hidden
        className="h-(--divider-space-phone) w-full md:h-(--divider-space)"
        style={
          {
            "--divider-space": `${space}px`,
            // A phone keeps the same share of a desktop gap that
            // Settings > Styling > Space between rows keeps, so the app has one
            // rule for this rather than a second one hiding in a row.
            "--divider-space-phone": `${Math.round(
              space * PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE
            )}px`,
          } as React.CSSProperties
        }
      />
    )
  }

  const color = frontPageDividerColor(shade)

  if (style === "dots") {
    return (
      <div
        aria-hidden
        className={cn("flex w-full items-center gap-3", alignClassName)}
      >
        {/* Bigger than the hairline is tall, because a dot at the line's own
            weight all but disappears next to it. */}
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    )
  }

  return (
    <hr
      aria-hidden
      className="w-full border-t"
      style={{ borderTopColor: color }}
    />
  )
}
