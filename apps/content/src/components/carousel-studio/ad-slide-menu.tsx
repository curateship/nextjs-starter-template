import * as React from "react"
import { FilmIcon, Loader2Icon, MegaphoneIcon, TypeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getAdsErrorMessage, loadAdsShelf, type ShelfAd } from "@/lib/api/video/ads"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Add an ad slide" under the carousel's slides (`workspace/docs/ads.md`):
 * an ad from the ads shelf becomes the carousel's last slide (Tyler, 4 Nov
 * 2026: "Last"). A sponsor clip is a video slide and a text ad a text slide;
 * a sound with no picture has nothing to show, so it is not offered.
 */
export function AdSlideMenu({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (ad: ShelfAd) => void
}) {
  const [ads, setAds] = React.useState<ShelfAd[] | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function load() {
    if (ads || loading) return
    setLoading(true)
    try {
      const shelf = await loadAdsShelf()
      setAds(
        shelf.ads.filter((ad) => ad.kind === "text" || ad.media?.file_type === "video")
      )
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error, "Your ads could not be loaded."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => (open ? void load() : undefined)}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full border-dashed"
          disabled={disabled}
        >
          <MegaphoneIcon />
          Add an ad slide
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Goes in as the last slide</DropdownMenuLabel>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading your ads
          </div>
        ) : ads?.length ? (
          ads.map((ad) => (
            <DropdownMenuItem key={ad.id} onSelect={() => onPick(ad)}>
              {ad.kind === "text" ? <TypeIcon /> : <FilmIcon />}
              <span className="truncate">{ad.name}</span>
            </DropdownMenuItem>
          ))
        ) : ads ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No sponsor clips or text ads on your shelf yet. Add them in the video editor's Ads
            panel.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
