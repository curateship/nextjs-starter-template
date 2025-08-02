"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface SiteBlockProps {
  siteName: string
  status: string
  userId: string
  themeId: string
  logo: File | null
  logoPreview: string | null
  onSiteNameChange: (value: string) => void
  onStatusChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onThemeIdChange: (value: string) => void
  onLogoChange: (file: File | null) => void
  onLogoPreviewChange: (preview: string | null) => void
}

export function SiteBlock({
  siteName,
  status,
  userId,
  themeId,
  logo,
  logoPreview,
  onSiteNameChange,
  onStatusChange,
  onUserIdChange,
  onThemeIdChange,
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

  // Mock data for users and themes - in a real app, this would come from props or API
  const users = [
    { id: "1", name: "John Doe", email: "john@example.com" },
    { id: "2", name: "Alice Smith", email: "alice@example.com" },
    { id: "3", name: "Robert Johnson", email: "robert@example.com" },
    { id: "4", name: "Maria Wilson", email: "maria@example.com" },
    { id: "5", name: "David Brown", email: "david@example.com" },
  ]

  const themes = [
    { id: "1", name: "Modern Store", description: "E-commerce focused theme" },
    { id: "2", name: "Minimal Blog", description: "Clean blog theme" },
    { id: "3", name: "Creative Portfolio", description: "Portfolio showcase theme" },
    { id: "4", name: "Default Theme", description: "Basic starter theme" },
    { id: "5", name: "App Template", description: "Web application theme" },
  ]

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Site Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Site Name */}
        <div className="space-y-2">
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

        {/* User and Theme Selection - One Row, Two Columns */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Select value={userId} onValueChange={onUserIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user">
                  {userId && users.find(user => user.id === userId) && (
                    <div className="flex items-center space-x-1">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 text-xs font-medium">
                          {users.find(user => user.id === userId)?.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="font-medium">{users.find(user => user.id === userId)?.name}</div>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center space-x-1">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 text-xs font-medium">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="font-medium">{user.name}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Select value={themeId} onValueChange={onThemeIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a theme" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    <div className="flex flex-col">
                      <div className="font-medium">{theme.name}</div>
                      <div className="text-xs text-muted-foreground">{theme.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

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