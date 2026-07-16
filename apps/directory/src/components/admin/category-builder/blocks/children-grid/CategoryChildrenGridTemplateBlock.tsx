"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import Check from "lucide-react/dist/esm/icons/check.js"
import { cn } from "@/lib/utils/tailwind"

type ImageFit = 'crop' | 'fit'

const IMAGE_FIT_OPTIONS: Record<ImageFit, { label: string; description: string }> = {
  crop: { label: 'Crop', description: 'Fill the image frame' },
  fit: { label: 'Fit', description: 'Show the full image' },
}

interface CategoryChildrenGridTemplateBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function CategoryChildrenGridTemplateBlock({ content, onContentChange, onBack }: CategoryChildrenGridTemplateBlockProps) {
  const title = content.title ?? ''
  const columns = content.columns ?? 3
  const mobileColumns = content.mobileColumns ?? 2
  const imageFit = (content.imageFit ?? 'crop') as ImageFit
  const imageHeight = content.imageHeight as number | undefined
  const imageQuality = content.imageQuality ?? 25
  const visibility = (content.visibility ?? {}) as Record<string, boolean>
  const showImage = visibility.showImage !== false

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Header">
                    <div className="max-w-sm space-y-2">
                      <Label htmlFor="sg-title">Section Title</Label>
                      <Input
                        id="sg-title"
                        value={title}
                        onChange={(e) => onContentChange('title', e.target.value)}
                        placeholder="Browse categories"
                      />
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "stylings",
          label: "Stylings",
          content: (
            <CardGroup className="grid">
              {showImage && (
                <Card>
                  <CardContent>
                    <BlockEditorSection heading="Image Display">
                      <div className="grid grid-cols-2 gap-2 max-w-sm">
                        {Object.entries(IMAGE_FIT_OPTIONS).map(([key, option]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => onContentChange('imageFit', key)}
                            className={cn(
                              "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                              imageFit === key
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                              imageFit === key
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            )}>
                              {imageFit === key && <Check className="h-3 w-3" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{option.label}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="mt-4 grid max-w-sm grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="sg-imageHeight">Image Height %</Label>
                          <Input
                            id="sg-imageHeight"
                            type="number"
                            min={0}
                            max={200}
                            value={imageHeight ?? ''}
                            onChange={(e) => {
                              const value = Number(e.target.value)
                              onContentChange('imageHeight', value > 0 ? value : undefined)
                            }}
                            placeholder="Default"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sg-imageQuality">Image Quality</Label>
                          <Input
                            id="sg-imageQuality"
                            type="number"
                            min={1}
                            max={100}
                            value={imageQuality ?? ''}
                            onChange={(e) => {
                              const value = Number(e.target.value)
                              onContentChange('imageQuality', value > 0 ? Math.min(100, value) : undefined)
                            }}
                            placeholder="25"
                          />
                        </div>
                      </div>
                    </BlockEditorSection>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Layout">
                    <div className="flex flex-wrap gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sg-mobileColumns">Mobile Columns</Label>
                        <Select
                          value={mobileColumns.toString()}
                          onValueChange={(v) => onContentChange('mobileColumns', parseInt(v))}
                        >
                          <SelectTrigger id="sg-mobileColumns" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Column</SelectItem>
                            <SelectItem value="2">2 Columns</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sg-columns">Columns</Label>
                        <Select
                          value={columns.toString()}
                          onValueChange={(v) => onContentChange('columns', parseInt(v))}
                        >
                          <SelectTrigger id="sg-columns" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 Columns</SelectItem>
                            <SelectItem value="3">3 Columns</SelectItem>
                            <SelectItem value="4">4 Columns</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <VisibilitySettings
                title="Element Visibility"
                visibility={visibility}
                onChange={(value) => onContentChange('visibility', value)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: 'title', label: 'Section Title' },
                  { key: 'showImage', label: 'Show Images' },
                ]}
              />

              <VisibilitySettings
                title="Block Visibility"
                visibility={visibility}
                onChange={(value) => onContentChange('visibility', value)}
                useCard
                fields={[]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
