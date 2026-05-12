import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { BlockEditorSection } from "@/components/ui/tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

interface VisibilityField {
  key: string
  label: string
  mode?: 'show' | 'hide'
}

interface VisibilitySettingsProps {
  visibility: Record<string, boolean> | undefined
  onChange: (visibility: Record<string, boolean>) => void
  fields: VisibilityField[]
  title?: string
  includeHideBlock?: boolean
  useCard?: boolean
}

export function VisibilitySettings({
  visibility,
  onChange,
  fields,
  title = "Visibility",
  includeHideBlock = true,
  useCard = false,
}: VisibilitySettingsProps) {
  const resolvedFields = includeHideBlock && !fields.some((field) => field.key === 'hideBlock')
    ? [...fields, { key: 'hideBlock', label: 'Hide Block', mode: 'hide' as const }]
    : fields

  const content = (
    <div className="space-y-4">
      {resolvedFields.map((field) => (
        <div key={field.key} className="flex items-center space-x-2">
          <Checkbox
            id={`visibility-${field.key}`}
            checked={field.mode === 'hide' ? visibility?.[field.key] === true : visibility?.[field.key] !== false}
            onCheckedChange={(checked) => {
              onChange({
                ...(visibility ?? {}),
                [field.key]: checked === true,
              })
            }}
          />
          <Label htmlFor={`visibility-${field.key}`} className="cursor-pointer">{field.label}</Label>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Toggle elements on or off, or hide the entire block, without deleting content.
      </p>
    </div>
  )

  if (!useCard) {
    return (
      <BlockEditorSection heading={title}>
        {content}
      </BlockEditorSection>
    )
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <DashboardModalCardTitle>{title}</DashboardModalCardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">{content}</CardContent>
    </Card>
  )
}
