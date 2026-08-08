import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ColorSwatch } from "@/components/ui/color-swatch"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
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
  getSiteErrorMessage,
  saveNewSite,
  saveSite,
  type Site,
} from "@/lib/api/sites/sites"
import {
  DEFAULT_THEME_COLOR,
  emptySiteSettings,
  MAX_NAV_LINKS,
  type SiteNavLink,
  type SiteSettings,
} from "@/lib/sites/site-settings"
import {
  cleanSubdomain,
  customDomainProblem,
  siteAddress,
  subdomainProblem,
} from "@/lib/sites/subdomain"
import { SITE_STATUSES, type SiteStatus } from "@/lib/sites/site-status"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Creating or editing one site: where it answers, and what it looks like.
 *
 * The address rules are checked here as the admin types *and* again on the
 * server. This half is a courtesy — it says what is wrong before a save fails —
 * and the server's half is the one that decides.
 */

const STATUS_LABELS: Record<SiteStatus, string> = {
  draft: "Draft — answers, but not announced",
  active: "Live",
  inactive: "Switched off — answers nothing",
}

export function SiteDialog({
  open,
  site,
  baseDomain,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The site being edited, or null when creating one. */
  site: Site | null
  /** The domain sites hang off, for the address preview. */
  baseDomain: string
  onClose: () => void
  onSaved: (saved: Site, wasNew: boolean) => void
}) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [subdomain, setSubdomain] = React.useState("")
  const [customDomain, setCustomDomain] = React.useState("")
  const [status, setStatus] = React.useState<SiteStatus>("draft")
  const [settings, setSettings] = React.useState<SiteSettings>(emptySiteSettings)
  const [saving, setSaving] = React.useState(false)

  // Reset to whatever the window was opened on, so a second open never shows
  // the last one's values.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (site?.id ?? "new") : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setName(site?.name ?? "")
    setDescription(site?.description ?? "")
    setSubdomain(site?.subdomain ?? "")
    setCustomDomain(site?.customDomain ?? "")
    setStatus(site?.status ?? "draft")
    setSettings(site?.settings ?? emptySiteSettings())
  }

  const dirty = site
    ? name !== site.name ||
      description !== site.description ||
      subdomain !== site.subdomain ||
      customDomain !== site.customDomain ||
      status !== site.status ||
      JSON.stringify(settings) !== JSON.stringify(site.settings)
    : name.trim() !== "" || subdomain.trim() !== ""

  const addressProblem = subdomain.trim() ? subdomainProblem(subdomain) : null
  const domainProblem = customDomainProblem(customDomain)

  function change<K extends keyof SiteSettings>(field: K, value: SiteSettings[K]) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  function changeLink(index: number, next: Partial<SiteNavLink>) {
    setSettings((current) => ({
      ...current,
      navigation: current.navigation.map((link, at) =>
        at === index ? { ...link, ...next } : link
      ),
    }))
  }

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      const input = {
        name,
        description,
        subdomain: cleanSubdomain(subdomain),
        customDomain,
        status,
        settings,
      }
      const saved = site
        ? await saveSite({ id: site.id, ...input })
        : await saveNewSite(input)
      onSaved(saved, !site)
    } catch (error) {
      showErrorToast(getSiteErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{site ? "Edit site" : "New site"}</DialogTitle>
            <DialogDescription>
              One deployment, many sites. Each one answers on its own address.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Where it answers</CardTitle>
                <CardDescription>
                  A site is reachable the moment it is saved, unless it is
                  switched off.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="site-name">Name</FieldLabel>
                  <Input
                    id="site-name"
                    value={name}
                    disabled={saving}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="site-subdomain"
                    hint="Lowercase letters, numbers and hyphens. This is the part in front of the base domain."
                  >
                    Address
                  </FieldLabel>
                  <Input
                    id="site-subdomain"
                    value={subdomain}
                    placeholder="alpha"
                    disabled={saving}
                    aria-invalid={addressProblem ? true : undefined}
                    aria-describedby="site-subdomain-note"
                    onChange={(event) => setSubdomain(event.target.value)}
                  />
                  <p
                    id="site-subdomain-note"
                    className={
                      addressProblem
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {addressProblem ?? siteAddress(subdomain, baseDomain)}
                  </p>
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="site-custom-domain"
                    hint="Optional. Point this domain at this server yourself — nothing here is checked or set up automatically."
                  >
                    Its own domain
                  </FieldLabel>
                  <Input
                    id="site-custom-domain"
                    value={customDomain}
                    placeholder="joes-diner.com"
                    disabled={saving}
                    aria-invalid={domainProblem ? true : undefined}
                    aria-describedby="site-custom-domain-note"
                    onChange={(event) => setCustomDomain(event.target.value)}
                  />
                  <p
                    id="site-custom-domain-note"
                    className={
                      domainProblem
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {domainProblem ??
                      "When set, this wins over the address above."}
                  </p>
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="site-status">State</FieldLabel>
                  <Select
                    value={status}
                    disabled={saving}
                    onValueChange={(value) => setStatus(value as SiteStatus)}
                  >
                    <SelectTrigger id="site-status" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_STATUSES.map((choice) => (
                        <SelectItem key={choice} value={choice}>
                          {STATUS_LABELS[choice]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="site-description"
                    hint="A note for whoever runs this deployment. Visitors never see it."
                  >
                    Note
                  </FieldLabel>
                  <Textarea
                    id="site-description"
                    rows={1}
                    value={description}
                    disabled={saving}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>How it looks</CardTitle>
                <CardDescription>
                  What a visitor sees on this site, instead of the app's own
                  name and logo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="site-title"
                    hint="Shown in the browser tab and as the heading. Falls back to the name."
                  >
                    Title
                  </FieldLabel>
                  <Input
                    id="site-title"
                    value={settings.title}
                    placeholder={name || "Alpha"}
                    disabled={saving}
                    onChange={(event) => change("title", event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="site-tagline">Tagline</FieldLabel>
                  <Input
                    id="site-tagline"
                    value={settings.tagline}
                    disabled={saving}
                    onChange={(event) => change("tagline", event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-start gap-4">
                  <ImageUpload
                    label="Logo"
                    aspect="square"
                    fit="contain"
                    className="max-w-24"
                    value={settings.logo}
                    disabled={saving}
                    onChange={(value) => change("logo", value)}
                  />
                  <ImageUpload
                    label="Favicon"
                    aspect="square"
                    fit="contain"
                    className="max-w-24"
                    value={settings.favicon}
                    disabled={saving}
                    onChange={(value) => change("favicon", value)}
                  />
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="site-theme-color">Accent colour</FieldLabel>
                  <div className="flex items-center gap-2">
                    <ColorSwatch
                      id="site-theme-color"
                      value={
                        /^#[0-9a-f]{6}$/i.test(settings.themeColor)
                          ? settings.themeColor
                          : DEFAULT_THEME_COLOR
                      }
                      disabled={saving}
                      onChange={(event) => change("themeColor", event.target.value)}
                    />
                    <Input
                      aria-label="Accent colour hex"
                      value={settings.themeColor}
                      placeholder={DEFAULT_THEME_COLOR}
                      disabled={saving}
                      className="w-32"
                      onChange={(event) => change("themeColor", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="site-meta-description"
                    hint="What search engines show under the title. Falls back to the tagline."
                  >
                    Search description
                  </FieldLabel>
                  <Textarea
                    id="site-meta-description"
                    rows={1}
                    value={settings.metaDescription}
                    disabled={saving}
                    onChange={(event) =>
                      change("metaDescription", event.target.value)
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="site-footer">Footer text</FieldLabel>
                  <Input
                    id="site-footer"
                    value={settings.footerText}
                    disabled={saving}
                    onChange={(event) => change("footerText", event.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <FieldLabel
                    htmlFor="site-maintenance"
                    hint="Visitors get a short notice instead of this site's pages. The app's other sites are unaffected."
                  >
                    Closed for maintenance
                  </FieldLabel>
                  <Switch
                    id="site-maintenance"
                    checked={settings.maintenance}
                    disabled={saving}
                    onCheckedChange={(value) => change("maintenance", value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Menu</CardTitle>
                <CardDescription>
                  Links across the top of this site. Up to {MAX_NAV_LINKS}.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {settings.navigation.map((link, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-2">
                      <FieldLabel htmlFor={`site-link-label-${index}`}>
                        Label
                      </FieldLabel>
                      <Input
                        id={`site-link-label-${index}`}
                        value={link.label}
                        disabled={saving}
                        onChange={(event) =>
                          changeLink(index, { label: event.target.value })
                        }
                      />
                    </div>
                    <div className="grid flex-1 gap-2">
                      <FieldLabel htmlFor={`site-link-href-${index}`}>
                        Address
                      </FieldLabel>
                      <Input
                        id={`site-link-href-${index}`}
                        value={link.href}
                        placeholder="/about"
                        disabled={saving}
                        onChange={(event) =>
                          changeLink(index, { href: event.target.value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={saving}
                      aria-label={`Remove menu link ${index + 1}`}
                      onClick={() =>
                        change(
                          "navigation",
                          settings.navigation.filter((_, at) => at !== index)
                        )
                      }
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}

                {settings.navigation.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No menu links yet.
                  </p>
                ) : null}

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || settings.navigation.length >= MAX_NAV_LINKS}
                    onClick={() =>
                      change("navigation", [
                        ...settings.navigation,
                        { label: "", href: "" },
                      ])
                    }
                  >
                    <PlusIcon className="size-4" />
                    Add link
                  </Button>
                </div>
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {site ? "Save changes" : "Create site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
