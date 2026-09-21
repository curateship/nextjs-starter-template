import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import type {
  FrontPageFaqItem,
  FrontPageLogo,
  FrontPageScreenshot,
  FrontPageTestimonial,
} from "@/lib/pages/front-page"
import { cn } from "@/lib/utils"

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

export function FrontPageLogos({ items }: { items: FrontPageLogo[] }) {
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
          />
        ))}
      </CardContent>
    </Card>
  )
}

export function FrontPageScreenshots({
  items,
}: {
  items: FrontPageScreenshot[]
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
