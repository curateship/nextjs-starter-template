import { StarIcon } from "lucide-react"

import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { SavedLink } from "@/components/shell/public-navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import {
  MAX_FRONT_PAGE_HERO_STARS,
  type FrontPageFaqItem,
  type FrontPageLogo,
  type FrontPageScreenshot,
  type FrontPageTestimonial,
} from "@/lib/pages/front-page"
import { cn } from "@/lib/utils"

/**
 * The top of a front page: a large heading, a line beneath it, a button, and a
 * short line of proof. A chosen picture puts all of that in a left column and
 * the picture in a right one; without a picture the words run across the page.
 * A phone stacks them either way, words first.
 */
export function FrontPageHero({
  heading,
  intro,
  image,
  alt,
  buttonLabel,
  buttonHref,
  note,
  stars,
  headingLevel,
  eager = false,
}: {
  heading: string
  intro: string
  image: string
  alt: string
  buttonLabel: string
  buttonHref: string
  note: string
  stars: number
  headingLevel: "h1" | "h2"
  eager?: boolean
}) {
  const Heading = headingLevel
  const words = (
    <div
      className={cn(
        "grid gap-6",
        // Long lines are hard to read, so the words stop short of the full
        // page even when no picture is taking the other half.
        image ? "w-full" : "w-full max-w-3xl"
      )}
    >
      <div className="grid gap-4">
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
        {intro ? (
          <p className="text-base text-muted-foreground md:text-lg">{intro}</p>
        ) : null}
      </div>

      {buttonLabel && buttonHref ? (
        <div
          className={cn("flex w-full", publicContentAlignmentRowClassName)}
        >
          <Button asChild size="lg">
            <SavedLink href={buttonHref}>{buttonLabel}</SavedLink>
          </Button>
        </div>
      ) : null}

      {stars > 0 || note ? (
        <div
          className={cn(
            "flex w-full flex-wrap items-center gap-2",
            publicContentAlignmentRowClassName
          )}
        >
          {stars > 0 ? (
            <span
              className="flex items-center gap-0.5"
              aria-label={`Rated ${stars} out of ${MAX_FRONT_PAGE_HERO_STARS}`}
            >
              {Array.from({ length: stars }, (_, index) => (
                <StarIcon
                  key={index}
                  aria-hidden="true"
                  className="size-4 fill-amber-400 text-amber-400"
                />
              ))}
            </span>
          ) : null}
          {note ? (
            <span className="text-sm text-muted-foreground">{note}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (!image) return <div className="w-full py-6 md:py-12">{words}</div>

  return (
    <div className="grid w-full gap-6 py-6 md:grid-cols-2 md:items-center md:gap-10 md:py-12">
      {words}
      <MediaThumbnail
        url={image}
        fileType="image"
        alt={alt}
        fit="contain"
        className="aspect-video w-full rounded-lg bg-muted/50"
        // Half the reading width on desktop, the whole of it on a phone.
        sizes="(min-width: 768px) 50vw, 100vw"
        eager={eager}
      />
    </div>
  )
}

export function FrontPageTestimonials({
  items,
}: {
  items: FrontPageTestimonial[]
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap gap-2 md:gap-3",
        publicContentAlignmentRowClassName
      )}
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
              className={cn(
                "flex items-center gap-2 self-end",
                publicContentAlignmentRowClassName
              )}
            >
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
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.role ? (
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

export function FrontPageFaq({ items }: { items: FrontPageFaqItem[] }) {
  return (
    <dl
      className={cn(
        "flex w-full flex-wrap gap-2 md:gap-3",
        publicContentAlignmentRowClassName
      )}
    >
      {items.map((item) => (
        <Card
          key={item.id}
          size="sm"
          className="w-full md:w-[calc(50%-0.375rem)]"
        >
          <CardContent className="grid gap-2">
            <dt className="text-sm font-medium">{item.question}</dt>
            <dd className="text-sm whitespace-pre-wrap text-muted-foreground">
              {item.answer}
            </dd>
          </CardContent>
        </Card>
      ))}
    </dl>
  )
}

export function FrontPageLogos({
  items,
  eager = false,
}: {
  items: FrontPageLogo[]
  eager?: boolean
}) {
  return (
    <Card size="sm" className="w-full">
      <CardContent
        className={cn(
          "flex flex-wrap items-center gap-4",
          publicContentAlignmentRowClassName
        )}
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
}: {
  items: FrontPageScreenshot[]
  eager?: boolean
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap gap-2 md:gap-3",
        publicContentAlignmentRowClassName
      )}
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
            <figcaption className="px-3 text-sm text-muted-foreground">
              {item.caption}
            </figcaption>
          </figure>
        </Card>
      ))}
    </div>
  )
}
