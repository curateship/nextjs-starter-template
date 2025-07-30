"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface SiteBlockProps {
  siteName: string
  status: string
  logo: File | null
  logoPreview: string | null
  onSiteNameChange: (value: string) => void
  onStatusChange: (value: string) => void
  onLogoChange: (file: File | null) => void
  onLogoPreviewChange: (preview: string | null) => void
}

export function SiteBlock({
  siteName,
  status,
  logo,
  logoPreview,
  onSiteNameChange,
  onStatusChange,
  onLogoChange,
  onLogoPreviewChange,
}: SiteBlockProps) {
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
        <CardTitle>Site Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Site Name */}
        <div className="space-y-2">
          <Label htmlFor="siteName">Site Name *</Label>
          <Input
            id="siteName"
            value={siteName}
            onChange={(e) => onSiteNameChange(e.target.value)}
            placeholder="Enter site name (e.g., mysite)"
            required
          />
          <p className="text-xs text-muted-foreground">
            This will be used to create your subdomain: {siteName || 'mysite'}.domain.com
          </p>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
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
          <Label>Site Logo</Label>
          {!logoPreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <Label htmlFor="logo-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, SVG up to 2MB (recommended: 200x200px)
                </span>
              </Label>
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