"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

interface HeroRuixenBlockProps {
  title: string
  subtitle: string
  primaryButton: string
  secondaryButton: string
  showRainbowButton: boolean
  githubLink: string
  showParticles: boolean
  onTitleChange: (value: string) => void
  onSubtitleChange: (value: string) => void
  onPrimaryButtonChange: (value: string) => void
  onSecondaryButtonChange: (value: string) => void
  onShowRainbowButtonChange: (value: boolean) => void
  onGithubLinkChange: (value: string) => void
  onShowParticlesChange: (value: boolean) => void
}

export function HeroRuixenBlock({
  title,
  subtitle,
  primaryButton,
  secondaryButton,
  showRainbowButton,
  githubLink,
  showParticles,
  onTitleChange,
  onSubtitleChange,
  onPrimaryButtonChange,
  onSecondaryButtonChange,
  onShowRainbowButtonChange,
  onGithubLinkChange,
  onShowParticlesChange,
}: HeroRuixenBlockProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Hero Section</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hero Title */}
        <div className="space-y-2">
          <Label htmlFor="heroTitle">Hero Title</Label>
          <input
            id="heroTitle"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md"
            placeholder="Build Exceptional Interfaces with Ease"
            required
          />
          <p className="text-xs text-muted-foreground">
            Main heading displayed in large text
          </p>
        </div>

        {/* Hero Subtitle */}
        <div className="space-y-2">
          <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
          <textarea
            id="heroSubtitle"
            value={subtitle}
            onChange={(e) => onSubtitleChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md"
            placeholder="Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."
            rows={3}
            required
          />
          <p className="text-xs text-muted-foreground">
            Description text below the main heading
          </p>
        </div>

        <Separator />

        {/* CTA Buttons */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Call-to-Action Buttons</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryButton">Primary Button Text</Label>
              <input
                id="primaryButton"
                type="text"
                value={primaryButton}
                onChange={(e) => onPrimaryButtonChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="Get Started"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="secondaryButton">Secondary Button Text</Label>
              <input
                id="secondaryButton"
                type="text"
                value={secondaryButton}
                onChange={(e) => onSecondaryButtonChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="Browse Components"
                required
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Rainbow Button Settings */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              id="showRainbowButton"
              type="checkbox"
              checked={showRainbowButton}
              onChange={(e) => onShowRainbowButtonChange(e.target.checked)}
              className="mr-2"
            />
            <Label htmlFor="showRainbowButton">Show Rainbow Button</Label>
          </div>
          
          {showRainbowButton && (
            <div className="space-y-2">
              <Label htmlFor="githubLink">GitHub Link</Label>
              <input
                id="githubLink"
                type="url"
                value={githubLink}
                onChange={(e) => onGithubLinkChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="https://github.com/ruixenui/ruixen-free-components"
              />
              <p className="text-xs text-muted-foreground">
                Link for the &ldquo;Get Access to Everything&rdquo; button
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Visual Effects */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Visual Effects</h4>
          
          <div className="flex items-center space-x-2">
            <input
              id="showParticles"
              type="checkbox"
              checked={showParticles}
              onChange={(e) => onShowParticlesChange(e.target.checked)}
              className="mr-2"
            />
            <Label htmlFor="showParticles">Show Floating Particles</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}