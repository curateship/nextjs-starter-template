import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
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
  getDirectorySettingsErrorMessage,
  loadDirectorySettings,
  saveBrowseSettings,
  type DirectoryBrowseSettingsInput,
} from "@/lib/api/directory/settings"
import {
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  type DirectorySort,
} from "@/lib/directory/public-search"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

export function DirectorySettings() {
  const [settings, setSettings] =
    React.useState<DirectoryBrowseSettingsInput | null>(null)
  const [pageSize, setPageSize] = React.useState("")
  const [save, saving] = useAsyncAction(getDirectorySettingsErrorMessage)
  const saveQueue = React.useRef(Promise.resolve(true))

  React.useEffect(() => {
    void loadDirectorySettings()
      .then((loadedSettings) => {
        setSettings(loadedSettings)
        setPageSize(String(loadedSettings.pageSize))
      })
      .catch(() => showErrorToast("The directory settings could not be loaded."))
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

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="directory-browse"
        title="Browse page"
        description="Choose how this site's public directory introduces and pages its listings."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="directory-browse-title">
            Page title
          </FieldLabel>
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
          <FieldLabel htmlFor="directory-browse-intro">
            Introduction
          </FieldLabel>
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
              const next = { ...settings, defaultSort: value as DirectorySort }
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
              {DIRECTORY_SORTS.map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {DIRECTORY_SORT_LABELS[sort]}
                </SelectItem>
              ))}
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
    </CardGroup>
  )
}
