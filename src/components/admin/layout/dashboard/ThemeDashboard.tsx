"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ThemeDashboardProps {
  title: string
  description: string
  status: string
  primaryFont: string
  secondaryFont: string
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onStatusChange: (value: string) => void
  onPrimaryFontChange: (value: string) => void
  onSecondaryFontChange: (value: string) => void
}

export function ThemeDashboard({
  title,
  description,
  status,
  primaryFont,
  secondaryFont,
  onTitleChange,
  onDescriptionChange,
  onStatusChange,
  onPrimaryFontChange,
  onSecondaryFontChange,
}: ThemeDashboardProps) {

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

      </CardContent>
    </Card>
  )
}

// claude.md followed