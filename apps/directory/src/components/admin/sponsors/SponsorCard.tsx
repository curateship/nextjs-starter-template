import { cn } from "@/lib/utils/tailwind"
import { sanitizeUrl } from "@/lib/utils/url-validator"
import type { SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"

interface SponsorCardProps {
  sponsor: SponsorPublic
  postId?: string
  className?: string
  tracking?: boolean
}

export function SponsorCard({ sponsor, postId, className, tracking = true }: SponsorCardProps) {
  const directHref = sanitizeUrl(sponsor.url, '#')
  const imageSrc = sanitizeUrl(sponsor.image_url, '')
  const isExternal = /^https?:\/\//i.test(directHref)
  // Tracked clicks go through the click route, which redirects to the stored sponsor URL
  const href = tracking && directHref !== '#' ? `/api/sponsors/click/${sponsor.id}` : directHref

  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "sponsored noopener noreferrer" : "sponsored"}
      data-sponsor-id={tracking ? sponsor.id : undefined}
      data-sponsor-track={tracking ? "true" : undefined}
      data-sponsor-placement={tracking ? "post_editor" : undefined}
      data-sponsor-post-id={tracking ? postId : undefined}
      data-sponsor-url={tracking ? directHref : undefined}
      className={cn(
        "not-prose my-6 flex items-center gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-lg",
        className
      )}
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {imageSrc ? (
          <img src={imageSrc} alt={sponsor.title} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Sponsor</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium uppercase tracking-normal text-muted-foreground">Sponsored</span>
        <span className="mt-1 block text-base font-semibold text-foreground">{sponsor.title}</span>
        {sponsor.description && (
          <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{sponsor.description}</span>
        )}
      </span>
    </a>
  )
}
