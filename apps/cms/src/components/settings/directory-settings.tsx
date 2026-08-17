import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { FrontPageSectionsPanel } from "@/components/directory/front-page-sections-panel"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  clearPublicPages,
  getClearPublicPagesErrorMessage,
  getDirectorySettingsErrorMessage,
  loadDirectorySettings,
  saveBrowseSettings,
  saveMapEnabled,
  type DirectoryBrowseSettingsInput,
  type DirectorySettings as DirectorySettingsValue,
} from "@/lib/api/directory/settings"
import {
  saveGeocodingKey,
  saveMapDisplayKey,
} from "@/lib/api/directory/geocoding-settings"
import {
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  type DirectoryDefaultSort,
} from "@/lib/directory/public-search"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

export function DirectorySettings() {
  const [settings, setSettings] = React.useState<DirectorySettingsValue | null>(
    null
  )
  const [pageSize, setPageSize] = React.useState("")
  const [geocodingKey, setGeocodingKey] = React.useState("")
  const [savedGeocodingKey, setSavedGeocodingKey] = React.useState<
    string | null
  >(null)
  const [mapKey, setMapKey] = React.useState("")
  const [savedMapKey, setSavedMapKey] = React.useState<string | null>(null)
  const [save, saving] = useAsyncAction(getDirectorySettingsErrorMessage)
  const [clearCache, clearingCache] = useAsyncAction(
    getClearPublicPagesErrorMessage
  )
  const saveQueue = React.useRef(Promise.resolve(true))

  React.useEffect(() => {
    void loadDirectorySettings()
      .then((loadedSettings) => {
        setSettings(loadedSettings)
        setPageSize(String(loadedSettings.pageSize))
        setSavedGeocodingKey(loadedSettings.geocodingKeyStatus)
        setSavedMapKey(loadedSettings.mapKeyStatus)
      })
      .catch(() =>
        showErrorToast("The directory settings could not be loaded.")
      )
  }, [])

  const persist = React.useCallback(
    (next: DirectoryBrowseSettingsInput) => {
      const queued = saveQueue.current.then(() =>
        save(() => saveBrowseSettings(next))
      )
      saveQueue.current = queued
      return queued
    },
    [save]
  )

  const pageNumber = Number(pageSize)
  const pageSizeInvalid =
    Boolean(settings) &&
    (!Number.isInteger(pageNumber) || pageNumber < 6 || pageNumber > 48)

  if (!settings) {
    return (
      <CardGroup>
        <Card>
          <CardContent>
            <LoadingRow label="Loading directory settings…" />
          </CardContent>
        </Card>
      </CardGroup>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="directory-near-me"
        title="Near me search"
        description="Let visitors find listings around a town, city, or postcode."
      >
        <div className="grid max-w-md gap-2">
          <FieldLabel
            htmlFor="directory-geocoding-key"
            hint="Enable Google Geocoding API and billing in Google Cloud first. This key is encrypted and only its last four characters are shown again."
          >
            Google Maps API key
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="directory-geocoding-key"
              type="password"
              value={geocodingKey}
              onChange={(event) => setGeocodingKey(event.target.value)}
              placeholder={
                savedGeocodingKey ?? "Paste your Google Maps API key"
              }
            />
            <Button
              type="button"
              disabled={!settings || !geocodingKey.trim() || saving}
              onClick={() => {
                if (!settings) return
                const key = geocodingKey.trim()
                void save(() => saveGeocodingKey(key)).then((saved) => {
                  if (!saved) return
                  setSavedGeocodingKey(`••••${key.slice(-4)}`)
                  setGeocodingKey("")
                  toast.success("Google Maps key saved.")
                })
              }}
            >
              Save key
            </Button>
          </div>
          {savedGeocodingKey ? (
            <p className="text-sm text-muted-foreground">
              Saved key: {savedGeocodingKey}
            </p>
          ) : null}
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="directory-map"
        title="Map view"
        description="Give the browse page a map button, showing the same results as pins."
        contentClassName="space-y-4"
      >
        <div className="flex items-center gap-2">
          <Switch
            id="directory-map-enabled"
            checked={settings.mapEnabled}
            disabled={saving}
            onCheckedChange={(mapEnabled) => {
              const previous = settings.mapEnabled
              setSettings({ ...settings, mapEnabled })
              void save(() => saveMapEnabled(mapEnabled)).then((saved) => {
                if (!saved) {
                  setSettings((current) =>
                    current ? { ...current, mapEnabled: previous } : current
                  )
                }
              })
            }}
          />
          <FieldLabel
            htmlFor="directory-map-enabled"
            hint="Off means no map button anywhere, which is how every site starts."
          >
            Offer a map on the browse page
          </FieldLabel>
        </div>

        <div className="grid max-w-md gap-2">
          <FieldLabel
            htmlFor="directory-map-key"
            hint="Enable the Maps JavaScript API in Google Cloud, then restrict this key to this site's web address. It is encrypted here and only its last four characters are shown again."
          >
            Map display key
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="directory-map-key"
              type="password"
              value={mapKey}
              onChange={(event) => setMapKey(event.target.value)}
              placeholder={savedMapKey ?? "Paste your Maps JavaScript key"}
            />
            <Button
              type="button"
              disabled={!mapKey.trim() || saving}
              onClick={() => {
                const key = mapKey.trim()
                void save(() => saveMapDisplayKey(key)).then((saved) => {
                  if (!saved) return
                  setSavedMapKey(`••••${key.slice(-4)}`)
                  setMapKey("")
                  toast.success("Map display key saved.")
                })
              }}
            >
              Save key
            </Button>
          </div>
          {savedMapKey ? (
            <p className="text-sm text-muted-foreground">
              Saved key: {savedMapKey}
            </p>
          ) : (
            /*
             * Said here rather than left to be discovered on the public page.
             * With the switch on and no key there is no map button at all, and
             * an admin who is not told why will reasonably think it is broken.
             */
            <p className="text-sm text-muted-foreground">
              No map key yet, so no map button appears even with the switch on.
              This is a second key from the one above on purpose: a key a
              browser may use has to be locked to your web address, and a key
              locked that way is refused by the place search.
            </p>
          )}
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="directory-front-page"
        title="Front page"
        description="The rows of listings this site's home page is made of, in the order they are drawn. It uses the Browse page title and introduction as its own heading."
      >
        <FrontPageSectionsPanel
          mapAvailable={settings.mapEnabled && settings.hasMapKey}
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="directory-browse"
        title="Browse page"
        description="Choose how this site's public directory introduces and pages its listings."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="directory-browse-title">Page title</FieldLabel>
          <Input
            id="directory-browse-title"
            value={settings?.browseTitle ?? ""}
            disabled={!settings}
            maxLength={120}
            aria-invalid={
              settings && !settings.browseTitle.trim() ? true : undefined
            }
            onChange={(event) => {
              if (settings) {
                setSettings({ ...settings, browseTitle: event.target.value })
              }
            }}
            onBlur={() => {
              if (!settings) return
              if (!settings.browseTitle.trim()) {
                showErrorToast("Give the directory browse page a title.")
                return
              }
              void persist(settings)
            }}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="directory-browse-intro">Introduction</FieldLabel>
          <Textarea
            id="directory-browse-intro"
            value={settings?.browseIntro ?? ""}
            disabled={!settings}
            maxLength={500}
            rows={3}
            onChange={(event) => {
              if (settings) {
                setSettings({ ...settings, browseIntro: event.target.value })
              }
            }}
            onBlur={() => {
              if (settings) void persist(settings)
            }}
          />
        </div>

        <div className="grid max-w-40 gap-2">
          <FieldLabel
            htmlFor="directory-page-size"
            hint="Choose between 6 and 48 listings per page."
          >
            Listings per page
          </FieldLabel>
          <Input
            id="directory-page-size"
            type="number"
            min={6}
            max={48}
            value={pageSize}
            disabled={!settings}
            aria-invalid={pageSizeInvalid || undefined}
            onChange={(event) => setPageSize(event.target.value)}
            onBlur={() => {
              if (!settings) return
              if (pageSizeInvalid) {
                showErrorToast("Listings per page must be between 6 and 48.")
                return
              }
              const next = { ...settings, pageSize: pageNumber }
              setSettings(next)
              void persist(next)
            }}
          />
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="directory-ordering"
        title="Listing order"
        description="Choose the starting order for browse and category pages."
        contentClassName="space-y-4"
      >
        <div className="grid max-w-xs gap-2">
          <FieldLabel htmlFor="directory-default-sort">
            Default order
          </FieldLabel>
          <Select
            value={settings?.defaultSort}
            disabled={!settings || saving}
            onValueChange={(value) => {
              if (!settings) return
              const previous = settings
              const next = {
                ...settings,
                defaultSort: value as DirectoryDefaultSort,
              }
              setSettings(next)
              void persist(next).then((saved) => {
                if (!saved) {
                  setSettings((current) =>
                    current
                      ? { ...current, defaultSort: previous.defaultSort }
                      : current
                  )
                }
              })
            }}
          >
            <SelectTrigger id="directory-default-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTORY_SORTS.filter((sort) => sort !== "distance").map(
                (sort) => (
                  <SelectItem key={sort} value={sort}>
                    {DIRECTORY_SORT_LABELS[sort]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="directory-featured-first"
            checked={settings?.featuredFirst ?? false}
            disabled={!settings || saving}
            onCheckedChange={(featuredFirst) => {
              if (!settings) return
              const previous = settings
              const next = { ...settings, featuredFirst }
              setSettings(next)
              void persist(next).then((saved) => {
                if (!saved) {
                  setSettings((current) =>
                    current
                      ? { ...current, featuredFirst: previous.featuredFirst }
                      : current
                  )
                }
              })
            }}
          />
          <FieldLabel
            htmlFor="directory-featured-first"
            hint="When off, featured listings follow the same order as everything else."
          >
            Show featured listings first
          </FieldLabel>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="directory-cache"
        title="Cached pages"
        description="Forget this site's saved public directory pages so the next visit rebuilds them."
      >
        <Button
          type="button"
          variant="outline"
          disabled={clearingCache}
          onClick={() => {
            void clearCache(async () => {
              await clearPublicPages()
              toast.success("Cached public pages cleared.")
            })
          }}
        >
          {clearingCache ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : null}
          Clear cached pages
        </Button>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
