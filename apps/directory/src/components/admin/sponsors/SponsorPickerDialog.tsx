"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import { getActiveSponsorsForPickerAction, type SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"
import { sanitizeUrl } from "@/lib/utils/url-validator"

interface SponsorPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  onSelectSponsor: (sponsor: SponsorPublic) => void
}

export function SponsorPickerDialog({ open, onOpenChange, siteId, onSelectSponsor }: SponsorPickerDialogProps) {
  const [sponsors, setSponsors] = useState<SponsorPublic[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadSponsors() {
      if (!open || !siteId) return

      setLoading(true)
      const { data } = await getActiveSponsorsForPickerAction({ data: { siteId } })

      if (!cancelled) {
        setSponsors(data)
        setLoading(false)
      }
    }

    loadSponsors()

    return () => {
      cancelled = true
    }
  }, [open, siteId])

  const filteredSponsors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return sponsors

    return sponsors.filter((sponsor) => {
      const searchText = `${sponsor.title} ${sponsor.description || ""} ${sponsor.url}`.toLowerCase()
      return searchText.includes(query)
    })
  }, [searchQuery, sponsors])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Insert Sponsor</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sponsors"
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-80 rounded-md border">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading sponsors...</div>
          ) : filteredSponsors.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No active sponsors found.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/admin/sponsors">Manage Sponsors</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredSponsors.map((sponsor) => {
                const imageSrc = sanitizeUrl(sponsor.image_url, "")

                return (
                  <button
                    key={sponsor.id}
                    type="button"
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent"
                    onClick={() => {
                      onSelectSponsor(sponsor)
                      onOpenChange(false)
                    }}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {imageSrc ? (
                        <img src={imageSrc} alt={sponsor.title} className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" title={sponsor.title}>{sponsor.title}</span>
                      {sponsor.description && (
                        <span className="mt-1 line-clamp-1 block text-xs text-muted-foreground" title={sponsor.description}>{sponsor.description}</span>
                      )}
                      <span className="mt-1 block truncate text-xs text-muted-foreground" title={sponsor.url}>{sponsor.url}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
