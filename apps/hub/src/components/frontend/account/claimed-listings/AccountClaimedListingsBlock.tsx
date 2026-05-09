"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ExternalLink, Loader2 } from "lucide-react"

import {
  getMyClaimedDirectoriesAction,
  updateMyClaimedDirectoryAction,
  type ClaimedDirectoryEditorItem,
} from "@/lib/actions/directories/directory-claim-actions"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface AccountClaimedListingsBlockProps {
  siteId: string
  content?: {
    title?: string
    description?: string
    listingLabel?: string
    saveButtonText?: string
    emptyText?: string
    visibility?: Record<string, boolean>
  }
  siteWidth?: "full" | "custom"
  customWidth?: number
  isPreview?: boolean
}

function linksToText(links: any[], kind: "social" | "menu") {
  if (!Array.isArray(links)) return ""
  return links.map((link) => {
    if (kind === "social") return [link.platform, link.url].filter(Boolean).join(" | ")
    return [link.type, link.label, link.value].filter((value) => value !== undefined && value !== null).join(" | ")
  }).join("\n")
}

function parseSocialLinks(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [platform = "", url = ""] = line.split("|").map((part) => part.trim())
      return { platform, url }
    })
}

function parseMenuLinks(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [type = "custom", label = "", linkValue = ""] = line.split("|").map((part) => part.trim())
      return { type, label, value: linkValue }
    })
}

export function AccountClaimedListingsBlock({
  siteId,
  content,
  siteWidth,
  customWidth,
  isPreview = false,
}: AccountClaimedListingsBlockProps) {
  const visibility = content?.visibility || {}
  const [items, setItems] = useState<ClaimedDirectoryEditorItem[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  )

  const [title, setTitle] = useState("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [introText, setIntroText] = useState("")
  const [socialLinks, setSocialLinks] = useState("")
  const [menuLinks, setMenuLinks] = useState("")
  const [mapLocation, setMapLocation] = useState("")
  const [mapCaption, setMapCaption] = useState("")
  const [hoursTitle, setHoursTitle] = useState("")
  const [hoursPlaceId, setHoursPlaceId] = useState("")

  useEffect(() => {
    if (isPreview) {
      setItems([])
      setSelectedId("")
      setLoading(false)
      return
    }

    let cancelled = false
    getMyClaimedDirectoriesAction(siteId).then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else {
        setItems(result.data)
        setSelectedId(result.data[0]?.id || "")
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [isPreview, siteId])

  useEffect(() => {
    if (!selectedItem) return
    setTitle(selectedItem.title || "")
    setFeaturedImage(selectedItem.featured_image || "")
    setMetaDescription(selectedItem.meta_description || "")
    setIntroText(typeof selectedItem.core?.introText === "string" ? selectedItem.core.introText : "")
    setSocialLinks(linksToText(selectedItem.core?.socialLinks || [], "social"))
    setMenuLinks(linksToText(selectedItem.core?.menuLinks || [], "menu"))
    setMapLocation(selectedItem.google_map?.locationQuery || "")
    setMapCaption(selectedItem.google_map?.caption || "")
    setHoursTitle(selectedItem.opening_hours?.title || "Business Hours")
    setHoursPlaceId(selectedItem.opening_hours?.placeId || "")
  }, [selectedItem])

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedItem || isPreview) return
    setMessage(null)
    setError(null)

    startTransition(async () => {
      const result = await updateMyClaimedDirectoryAction({
        siteId,
        directoryId: selectedItem.id,
        title,
        featuredImage,
        metaDescription,
        introText,
        socialLinks: parseSocialLinks(socialLinks),
        menuLinks: parseMenuLinks(menuLinks),
        googleMap: selectedItem.google_map ? { locationQuery: mapLocation, caption: mapCaption } : null,
        openingHours: selectedItem.opening_hours ? { title: hoursTitle, placeId: hoursPlaceId } : null,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setItems((current) => current.map((item) => item.id === selectedItem.id ? {
        ...item,
        title,
        featured_image: featuredImage,
        meta_description: metaDescription,
        core: {
          ...item.core,
          introText,
          socialLinks: parseSocialLinks(socialLinks),
          menuLinks: parseMenuLinks(menuLinks),
        },
        google_map: item.google_map ? { ...item.google_map, locationQuery: mapLocation, caption: mapCaption } : null,
        opening_hours: item.opening_hours ? { ...item.opening_hours, title: hoursTitle, placeId: hoursPlaceId } : null,
      } : item))
      setMessage("Listing saved.")
    })
  }

  return (
    <BlockContainer
      header={{
        title: visibility.title === false ? "" : content?.title || "Claimed Listings",
        subtitle: visibility.description === false ? "" : content?.description || "",
        align: "left",
      }}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      {loading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading listings...</CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{content?.emptyText || "No approved listing claims yet."}</CardContent></Card>
      ) : (
        <form className="space-y-6" onSubmit={handleSave}>
          {visibility.listingSelector !== false ? (
            <div className="max-w-md space-y-2">
              <Label>{content?.listingLabel || "Listing"}</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Listing Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="claimed-title">Title</Label>
                  <Input id="claimed-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
                </div>
                {visibility.image !== false ? (
                  <div className="space-y-2">
                    <Label htmlFor="claimed-image">Featured Image URL</Label>
                    <Input id="claimed-image" value={featuredImage} onChange={(event) => setFeaturedImage(event.target.value)} />
                  </div>
                ) : null}
              </div>

              {visibility.metaDescription !== false ? (
                <div className="space-y-2">
                  <Label htmlFor="claimed-meta">Meta Description</Label>
                  <Textarea id="claimed-meta" value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} rows={3} />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="claimed-intro">Intro Text</Label>
                <Textarea id="claimed-intro" value={introText} onChange={(event) => setIntroText(event.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>

          {visibility.links !== false ? (
            <Card>
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="claimed-social">Social Links</Label>
                  <Textarea id="claimed-social" value={socialLinks} onChange={(event) => setSocialLinks(event.target.value)} rows={5} placeholder="instagram | https://instagram.com/example" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimed-menu">Menu Links</Label>
                  <Textarea id="claimed-menu" value={menuLinks} onChange={(event) => setMenuLinks(event.target.value)} rows={5} placeholder="website | Website | example.com" />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {(selectedItem?.google_map && visibility.map !== false) || (selectedItem?.opening_hours && visibility.hours !== false) ? (
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {selectedItem?.google_map && visibility.map !== false ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="claimed-map-location">Map Location</Label>
                      <Input id="claimed-map-location" value={mapLocation} onChange={(event) => setMapLocation(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="claimed-map-caption">Map Caption</Label>
                      <Input id="claimed-map-caption" value={mapCaption} onChange={(event) => setMapCaption(event.target.value)} />
                    </div>
                  </>
                ) : null}

                {selectedItem?.opening_hours && visibility.hours !== false ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="claimed-hours-title">Hours Title</Label>
                      <Input id="claimed-hours-title" value={hoursTitle} onChange={(event) => setHoursTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="claimed-hours-place">Google Place ID</Label>
                      <Input id="claimed-hours-place" value={hoursPlaceId} onChange={(event) => setHoursPlaceId(event.target.value)} />
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedItem ? (
              <Button variant="outline" asChild>
                <a href={`/directories/${selectedItem.slug}`} target="_blank" rel="noopener noreferrer">
                  View Listing
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : <div />}
            <Button type="submit" disabled={isPending || isPreview}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {content?.saveButtonText || "Save Listing"}
            </Button>
          </div>
        </form>
      )}
    </BlockContainer>
  )
}
