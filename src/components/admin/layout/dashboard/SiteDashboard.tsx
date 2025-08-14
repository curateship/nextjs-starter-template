"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X, AlertCircle, CheckCircle2 } from "lucide-react"
import { getActiveThemesAction } from "@/lib/actions/theme-actions"
import { checkSubdomainAvailabilityAction } from "@/lib/actions/site-actions"
import type { Theme } from "@/lib/supabase/themes"
import { FontSelector } from "@/components/admin/layout/page-builder/font-selector"

interface SiteDashboardProps {
  siteName: string
  status: string
  themeId: string
  logo: File | null
  logoPreview: string | null
  description?: string
  isEditMode?: boolean
  fontFamily?: string
  secondaryFontFamily?: string
  onSiteNameChange: (value: string) => void
  onStatusChange: (value: string) => void
  onThemeIdChange: (value: string) => void
  onLogoChange: (file: File | null) => void
  onLogoPreviewChange: (preview: string | null) => void
  onDescriptionChange?: (value: string) => void
  onFontFamilyChange?: (value: string) => void
  onSecondaryFontFamilyChange?: (value: string) => void
}

export function SiteDashboard({
  siteName,
  status,
  themeId,
  logo,
  logoPreview,
  description = "",
  isEditMode = false,
  fontFamily = "playfair-display",
  secondaryFontFamily = "inter",
  onSiteNameChange,
  onStatusChange,
  onThemeIdChange,
  onLogoChange,
  onLogoPreviewChange,
  onDescriptionChange,
  onFontFamilyChange,
  onSecondaryFontFamilyChange,
}: SiteDashboardProps) {
  const [themes, setThemes] = useState<Theme[]>([])
  const [themesLoading, setThemesLoading] = useState(true)
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checking: boolean
    available: boolean | null
    suggestion?: string
  }>({ checking: false, available: null })

  // Load themes on component mount
  useEffect(() => {
    loadThemes()
  }, [])

  // Check subdomain availability when site name changes (only in create mode)
  useEffect(() => {
    if (!isEditMode && siteName.trim()) {
      checkSubdomainAvailability(siteName)
    } else {
      setSubdomainStatus({ checking: false, available: null })
    }
  }, [siteName, isEditMode])

  const loadThemes = async () => {
    try {
      setThemesLoading(true)
      const { data, error } = await getActiveThemesAction()
      
      if (error) {
        console.error('Error loading themes:', error)
        return
      }
      
      if (data) {
        setThemes(data)
      }
    } catch (err) {
      console.error('Error loading themes:', err)
    } finally {
      setThemesLoading(false)
    }
  }

  const checkSubdomainAvailability = async (name: string) => {
    const subdomain = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    
    if (!subdomain) {
      setSubdomainStatus({ checking: false, available: null })
      return
    }

    try {
      setSubdomainStatus({ checking: true, available: null })
      const { available, suggestion } = await checkSubdomainAvailabilityAction(subdomain)
      setSubdomainStatus({ 
        checking: false, 
        available, 
        suggestion: available ? undefined : suggestion 
      })
    } catch (err) {
      console.error('Error checking subdomain:', err)
      setSubdomainStatus({ checking: false, available: null })
    }
  }
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onLogoChange(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        onLogoPreviewChange(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = () => {
    onLogoChange(null)
    onLogoPreviewChange(null)
  }


  const getSubdomainFromName = (name: string) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Site Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Site Name */}
        <div className="space-y-2">
          <div className="relative">
            <Input
              id="siteName"
              value={siteName}
              onChange={(e) => onSiteNameChange(e.target.value)}
              placeholder="Enter site name (e.g., mysite)"
              required
              className={
                subdomainStatus.available === false 
                  ? "pr-10 border-red-300 focus:border-red-500" 
                  : subdomainStatus.available === true 
                  ? "pr-10 border-green-300 focus:border-green-500"
                  : ""
              }
            />
            {subdomainStatus.checking && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
              </div>
            )}
            {!subdomainStatus.checking && subdomainStatus.available === true && (
              <CheckCircle2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
            {!subdomainStatus.checking && subdomainStatus.available === false && (
              <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-500" />
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Subdomain: {getSubdomainFromName(siteName) || 'mysite'}.domain.com
            </p>
            {subdomainStatus.available === false && subdomainStatus.suggestion && (
              <p className="text-amber-600">
                Subdomain not available. Suggested: {subdomainStatus.suggestion}.domain.com
              </p>
            )}
            {subdomainStatus.available === true && (
              <p className="text-green-600">
                Subdomain is available!
              </p>
            )}
          </div>
        </div>

        {/* Site Description */}
        {onDescriptionChange && (
          <div className="space-y-2">
            <Input
              id="siteDescription"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Brief description of your site"
            />
          </div>
        )}

        {/* Theme Selection */}
        <div className="space-y-2">
            <Select value={themeId} onValueChange={onThemeIdChange}>
              <SelectTrigger>
                <SelectValue placeholder={themesLoading ? "Loading themes..." : "Select a theme"} />
              </SelectTrigger>
              <SelectContent>
                {themesLoading ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                      <span>Loading themes...</span>
                    </div>
                  </SelectItem>
                ) : themes.length === 0 ? (
                  <SelectItem value="no-themes" disabled>
                    No active themes available
                  </SelectItem>
                ) : (
                  themes.map((theme) => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {themeId && themes.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {(() => {
                  const selectedTheme = themes.find(t => t.id === themeId)
                  return selectedTheme ? (
                    <div className="flex items-center justify-between">
                      <span>Selected: {selectedTheme.name}</span>
                      {selectedTheme.template_path && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-6 px-2 text-xs"
                          asChild
                        >
                          <a 
                            href={selectedTheme.template_path} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            Preview
                          </a>
                        </Button>
                      )}
                    </div>
                  ) : null
                })()}
              </div>
            )}
        </div>

        {/* Font Selectors - Two Column Layout */}
        {(onFontFamilyChange || onSecondaryFontFamilyChange) && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Typography</h3>
            <div className="grid grid-cols-2 gap-4">
              {onFontFamilyChange && (
                <FontSelector
                  value={fontFamily}
                  onChange={onFontFamilyChange}
                  label="Primary Font"
                  description="Used for headings and titles"
                />
              )}
              {onSecondaryFontFamilyChange && (
                <FontSelector
                  value={secondaryFontFamily}
                  onChange={onSecondaryFontFamilyChange}
                  label="Secondary Font"
                  description="Used for body text and content"
                />
              )}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="space-y-2">
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Site Logo */}
        <div className="space-y-2">
          {!logoPreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <label htmlFor="logo-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, SVG up to 2MB (recommended: 200x200px)
                </span>
              </label>
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative">
              <img
                src={logoPreview}
                alt="Site logo preview"
                className="w-32 h-32 object-cover rounded-lg border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removeLogo}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// claude.md followed