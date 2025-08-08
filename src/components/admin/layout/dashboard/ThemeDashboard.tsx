"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface ThemeDashboardProps {
  title: string
  description: string
  status: string
  primaryFont: string
  secondaryFont: string
  logo: File | null
  logoPreview: string | null
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onStatusChange: (value: string) => void
  onPrimaryFontChange: (value: string) => void
  onSecondaryFontChange: (value: string) => void
  onLogoChange: (file: File | null) => void
  onLogoPreviewChange: (preview: string | null) => void
  templatePath?: string
  onTemplatePathChange?: (value: string) => void
}

export function ThemeDashboard({
  title,
  description,
  status,
  primaryFont,
  secondaryFont,
  logo,
  logoPreview,
  onTitleChange,
  onDescriptionChange,
  onStatusChange,
  onPrimaryFontChange,
  onSecondaryFontChange,
  onLogoChange,
  onLogoPreviewChange,
  templatePath,
  onTemplatePathChange,
}: ThemeDashboardProps) {
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

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Theme Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Enter theme name (e.g., Modern Business, Creative Portfolio)"
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Input
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Brief description of the theme style and features"
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Template Path */}
        {templatePath !== undefined && onTemplatePathChange && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Template Path</label>
            <Input
              id="templatePath"
              value={templatePath}
              onChange={(e) => onTemplatePathChange(e.target.value)}
              placeholder="/themes/theme-name"
            />
            <p className="text-xs text-muted-foreground">
              Path to the theme template files (e.g., /themes/marketplace)
            </p>
          </div>
        )}

        {/* Font Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Font</label>
            <Select value={primaryFont} onValueChange={onPrimaryFontChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select primary font" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inter">Inter</SelectItem>
                <SelectItem value="roboto">Roboto</SelectItem>
                <SelectItem value="open-sans">Open Sans</SelectItem>
                <SelectItem value="poppins">Poppins</SelectItem>
                <SelectItem value="montserrat">Montserrat</SelectItem>
                <SelectItem value="lato">Lato</SelectItem>
                <SelectItem value="nunito">Nunito</SelectItem>
                <SelectItem value="source-sans-pro">Source Sans Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Secondary Font</label>
            <Select value={secondaryFont} onValueChange={onSecondaryFontChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select secondary font" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inter">Inter</SelectItem>
                <SelectItem value="roboto">Roboto</SelectItem>
                <SelectItem value="open-sans">Open Sans</SelectItem>
                <SelectItem value="poppins">Poppins</SelectItem>
                <SelectItem value="montserrat">Montserrat</SelectItem>
                <SelectItem value="lato">Lato</SelectItem>
                <SelectItem value="nunito">Nunito</SelectItem>
                <SelectItem value="source-sans-pro">Source Sans Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Theme Logo/Preview */}
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
                  PNG, JPG up to 5MB (recommended: 400x300px theme preview)
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
                alt="Theme preview"
                className="w-full h-48 object-cover rounded-lg border"
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
          <p className="text-xs text-muted-foreground">
            Upload a preview image showing how the theme looks when applied to a site
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// claude.md followed