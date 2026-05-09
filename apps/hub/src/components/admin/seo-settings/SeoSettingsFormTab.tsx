"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { getSiteForAudit, saveSiteAuditSettings } from "@/lib/actions/seo/site-audit/site-audit-actions"
import { buildCanonicalUrl, getHomeSeoDescription, getHomeSeoTitle } from "@/lib/utils/seo-helpers"
import { toCdnUrl } from "@/lib/utils/cdn"

interface SeoSettingsFormTabProps {
  siteId: string
  mode: "metadata" | "technical"
  formId: string
  onStatusChange?: (status: { loading: boolean; saving: boolean; message: string | null }) => void
}

const CONTENT_SEO_CARDS = [
  {
    key: "pages",
    label: "Pages",
    itemLabel: "page",
    description: "Default metadata for public pages.",
    titleSetting: "seo_pages_title_template",
    descriptionSetting: "seo_pages_description_template",
    titleToken: "{{page_title}}",
    defaultTitleTemplate: "{{page_title}} | {{site_title}}",
    defaultDescriptionTemplate: "Visit {{page_title}} on {{site_title}}"
  },
  {
    key: "posts",
    label: "Posts",
    itemLabel: "post",
    description: "Default metadata for post pages.",
    titleSetting: "seo_posts_title_template",
    descriptionSetting: "seo_posts_description_template",
    titleToken: "{{post_title}}",
    defaultTitleTemplate: "{{post_title}} | {{site_title}}",
    defaultDescriptionTemplate: "Read {{post_title}} on {{site_title}}"
  },
  {
    key: "products",
    label: "Products",
    itemLabel: "product",
    description: "Default metadata for product pages.",
    titleSetting: "seo_products_title_template",
    descriptionSetting: "seo_products_description_template",
    titleToken: "{{product_title}}",
    defaultTitleTemplate: "{{product_title}} | {{site_title}}",
    defaultDescriptionTemplate: "{{product_title}} from {{site_title}}"
  },
  {
    key: "categories",
    label: "Categories",
    itemLabel: "category",
    description: "Default metadata for category pages.",
    titleSetting: "seo_categories_title_template",
    descriptionSetting: "seo_categories_description_template",
    titleToken: "{{category_title}}",
    defaultTitleTemplate: "{{category_title}} | {{site_title}}",
    defaultDescriptionTemplate: "{{category_title}} on {{site_title}}"
  },
  {
    key: "directories",
    label: "Directory",
    itemLabel: "directory item",
    description: "Default metadata for directory item pages.",
    titleSetting: "seo_directories_title_template",
    descriptionSetting: "seo_directories_description_template",
    titleToken: "{{directory_title}}",
    defaultTitleTemplate: "{{directory_title}} | {{site_title}}",
    defaultDescriptionTemplate: "{{directory_title}} on {{site_title}}"
  },
  {
    key: "events",
    label: "Events",
    itemLabel: "event",
    description: "Default metadata for event pages.",
    titleSetting: "seo_events_title_template",
    descriptionSetting: "seo_events_description_template",
    titleToken: "{{event_title}}",
    defaultTitleTemplate: "{{event_title}} | {{site_title}}",
    defaultDescriptionTemplate: "{{event_title}} on {{site_title}}"
  }
] as const

type ContentSeoCardKey = (typeof CONTENT_SEO_CARDS)[number]["key"]
type ContentTemplateState = Record<ContentSeoCardKey, { title: string; description: string }>

function getDefaultContentTemplates(): ContentTemplateState {
  const templates = {} as ContentTemplateState
  for (const card of CONTENT_SEO_CARDS) {
    templates[card.key] = {
      title: card.defaultTitleTemplate,
      description: card.defaultDescriptionTemplate
    }
  }
  return templates
}

function getContentTemplateSettings(templates: ContentTemplateState) {
  const settings: Record<string, string | undefined> = {}
  for (const card of CONTENT_SEO_CARDS) {
    settings[card.titleSetting] = templates[card.key].title.trim() || undefined
    settings[card.descriptionSetting] = templates[card.key].description.trim() || undefined
  }
  return settings
}

function HomePageSearchResultCard({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Home Page Search Result</CardTitle>
      </CardHeader>
      <CardContent className="max-w-2xl space-y-1">
        <p className="truncate text-sm text-green-700">{url}</p>
        <h3 className="text-xl text-blue-700">{title}</h3>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function HomePageSocialCard({
  title,
  description,
  url,
  ogImage
}: {
  title: string
  description: string
  url: string
  ogImage: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Home Page Social Card</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-xl overflow-hidden rounded-md border bg-background">
          {ogImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ogImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
          ) : (
            <div className="flex aspect-[1.91/1] items-center justify-center bg-muted text-sm text-muted-foreground">
              No default image
            </div>
          )}
          <div className="space-y-1 p-4">
            <p className="truncate text-xs uppercase text-muted-foreground">{new URL(url).host}</p>
            <h3 className="font-medium">{title}</h3>
            <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SeoSettingsFormTab({ siteId, mode, formId, onStatusChange }: SeoSettingsFormTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [site, setSite] = useState<any>(null)
  const [homeTitle, setHomeTitle] = useState("")
  const [homeDescription, setHomeDescription] = useState("")
  const [contentTemplates, setContentTemplates] = useState<ContentTemplateState>(() => getDefaultContentTemplates())
  const [ogImage, setOgImage] = useState("")
  const [twitterCardType, setTwitterCardType] = useState("summary_large_image")
  const [twitterHandle, setTwitterHandle] = useState("")
  const [googleVerification, setGoogleVerification] = useState("")
  const [canonicalDomain, setCanonicalDomain] = useState("")
  const [orgName, setOrgName] = useState("")
  const [orgLogo, setOrgLogo] = useState("")
  const [socialLinks, setSocialLinks] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const siteData = await getSiteForAudit(siteId)
      if (siteData) {
        setSite(siteData)
        const settings = siteData.settings || {}
        setHomeTitle(settings.seo_home_title || settings.site_title || siteData.name || "")
        setHomeDescription(settings.seo_home_description || settings.seo_site_description || "")
        const loadedTemplates = getDefaultContentTemplates()
        for (const card of CONTENT_SEO_CARDS) {
          loadedTemplates[card.key] = {
            title: settings[card.titleSetting] || card.defaultTitleTemplate,
            description: settings[card.descriptionSetting] || card.defaultDescriptionTemplate
          }
        }
        setContentTemplates(loadedTemplates)
        setOgImage(settings.seo_default_og_image || "")
        setTwitterCardType(settings.seo_twitter_card_type || "summary_large_image")
        setTwitterHandle(settings.seo_twitter_handle || "")
        setGoogleVerification(settings.seo_google_verification || "")
        setCanonicalDomain(settings.seo_canonical_domain || "")
        setOrgName(settings.seo_org_name || "")
        setOrgLogo(settings.seo_org_logo || "")
        setSocialLinks((settings.seo_org_social_links || []).join("\n"))
      }
    } catch (err) {
      console.error("Error loading SEO settings:", err)
      setError("Failed to load SEO settings")
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    onStatusChange?.({ loading, saving, message: saveMessage })
  }, [loading, onStatusChange, saveMessage, saving])

  const canonicalPreview = useMemo(() => {
    if (!site) return ""
    if (canonicalDomain === "custom") {
      return site.custom_domain ? `https://${site.custom_domain}` : "Custom domain is not configured"
    }
    if (canonicalDomain === "subdomain") {
      return `https://${site.subdomain}.systemeverything.com`
    }
    return site.custom_domain ? `https://${site.custom_domain}` : `https://${site.subdomain}.systemeverything.com`
  }, [canonicalDomain, site])

  const homePreview = useMemo(() => {
    if (!site) return null

    return {
      title: homeTitle.trim() || getHomeSeoTitle(site),
      description: homeDescription.trim() || getHomeSeoDescription(site),
      url: buildCanonicalUrl(site, "/"),
      ogImage: ogImage.trim() ? toCdnUrl(ogImage.trim()) : null
    }
  }, [homeDescription, homeTitle, ogImage, site])

  const handleSave = async () => {
    if (saving) return

    setSaving(true)
    setError(null)
    setSaveMessage(null)

    const result = await saveSiteAuditSettings(
      siteId,
      mode === "metadata"
        ? {
            seo_home_title: homeTitle.trim() || undefined,
            seo_home_description: homeDescription.trim() || undefined,
            ...getContentTemplateSettings(contentTemplates),
            seo_default_og_image: ogImage.trim() || undefined,
            seo_twitter_card_type: (twitterCardType as any) || undefined,
            seo_twitter_handle: twitterHandle.trim() || undefined
          }
        : {
            seo_google_verification: googleVerification.trim() || undefined,
            seo_canonical_domain: (canonicalDomain as any) || undefined,
            seo_org_name: orgName.trim() || undefined,
            seo_org_logo: orgLogo.trim() || undefined,
            seo_org_social_links: socialLinks
              ? socialLinks
                  .split("\n")
                  .map((link) => link.trim())
                  .filter(Boolean)
              : undefined
          }
    )

    setSaving(false)
    if (result.success) {
      setSaveMessage("SEO settings saved")
      window.setTimeout(() => setSaveMessage(null), 3000)
      loadData()
    } else {
      setError(result.error || "Failed to save SEO settings")
    }
  }

  const updateContentTemplate = (
    key: ContentSeoCardKey,
    field: keyof ContentTemplateState[ContentSeoCardKey],
    value: string
  ) => {
    setContentTemplates((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value
      }
    }))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <form
      id={formId}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {mode === "metadata" ? (
        <>
          {homePreview && (
            <HomePageSearchResultCard
              title={homePreview.title}
              description={homePreview.description}
              url={homePreview.url}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Home Page Title & Description</CardTitle>
              <CardDescription>Metadata used for the public home page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="home-title">Home Page Title</Label>
                <Input
                  id="home-title"
                  value={homeTitle}
                  onChange={(event) => setHomeTitle(event.target.value)}
                  placeholder="Home page search title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="home-description">Home Page Meta Description</Label>
                <Textarea
                  id="home-description"
                  value={homeDescription}
                  onChange={(event) => setHomeDescription(event.target.value)}
                  placeholder="Describe the home page for search engines..."
                  rows={1}
                  className="h-10 min-h-10 resize-none overflow-hidden"
                />
                <p className="text-xs text-muted-foreground">{homeDescription.length}/160 characters</p>
              </div>
            </CardContent>
          </Card>

          {CONTENT_SEO_CARDS.map((card) => (
            <Card key={card.key}>
              <CardHeader>
                <CardTitle className="text-base">{card.label}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`${card.key}-title-template`}>Title Template</Label>
                  <Input
                    id={`${card.key}-title-template`}
                    value={contentTemplates[card.key].title}
                    onChange={(event) => updateContentTemplate(card.key, "title", event.target.value)}
                    placeholder={card.defaultTitleTemplate}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tokens: {card.titleToken}, {"{{site_title}}"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${card.key}-description-template`}>Meta Description Template</Label>
                  <Textarea
                    id={`${card.key}-description-template`}
                    value={contentTemplates[card.key].description}
                    onChange={(event) => updateContentTemplate(card.key, "description", event.target.value)}
                    placeholder={card.defaultDescriptionTemplate}
                    rows={1}
                    className="h-10 min-h-10 resize-none overflow-hidden"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used when a {card.itemLabel} does not have its own meta description.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}

          {homePreview && (
            <HomePageSocialCard
              title={homePreview.title}
              description={homePreview.description}
              url={homePreview.url}
              ogImage={homePreview.ogImage}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Social Preview Defaults</CardTitle>
              <CardDescription>Fallback image and Twitter/X card metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="og-image">Default OG Image URL</Label>
                <Input
                  id="og-image"
                  value={ogImage}
                  onChange={(event) => setOgImage(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              {ogImage && (
                <div className="overflow-hidden rounded-md border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ogImage}
                    alt="Default Open Graph preview"
                    className="aspect-[1.91/1] w-full max-w-xl object-cover"
                  />
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Twitter Card Type</Label>
                  <Select value={twitterCardType} onValueChange={setTwitterCardType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="summary_large_image">Large Image</SelectItem>
                      <SelectItem value="summary">Summary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twitter">Twitter Handle</Label>
                  <Input
                    id="twitter"
                    value={twitterHandle}
                    onChange={(event) => setTwitterHandle(event.target.value)}
                    placeholder="@yourhandle"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search Engine Setup</CardTitle>
              <CardDescription>Verification and canonical URL settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="google-verify">Google Verification Code</Label>
                <Input
                  id="google-verify"
                  value={googleVerification}
                  onChange={(event) => setGoogleVerification(event.target.value)}
                  placeholder="google-site-verification value..."
                />
              </div>
              <div className="space-y-2">
                <Label>Canonical Domain</Label>
                <Select
                  value={canonicalDomain || "not_set"}
                  onValueChange={(value) => setCanonicalDomain(value === "not_set" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_set">Not configured</SelectItem>
                    <SelectItem value="custom">Custom Domain</SelectItem>
                    <SelectItem value="subdomain">Subdomain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {canonicalPreview && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Preview: {canonicalPreview}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Structured Data</CardTitle>
              <CardDescription>Organization details used in JSON-LD schema.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="Your organization name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-logo">Organization Logo URL</Label>
                  <Input
                    id="org-logo"
                    value={orgLogo}
                    onChange={(event) => setOrgLogo(event.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="social-links">Social Profile URLs</Label>
                <Textarea
                  id="social-links"
                  value={socialLinks}
                  onChange={(event) => setSocialLinks(event.target.value)}
                  placeholder={"https://twitter.com/yourhandle\nhttps://instagram.com/yourhandle"}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">One URL per line.</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </form>
  )
}
