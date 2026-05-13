import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  helperText?: string | null
}

export function VisibilitySettings({
  visibility,
  onChange,
  fields,
  title = "Visibility",
  includeHideBlock = true,
  useCard = false,
  helperText = "Toggle elements on or off, or hide the entire block, without deleting content.",
}: VisibilitySettingsProps) {
  const resolvedFields = includeHideBlock && !fields.some((field) => field.key === 'hideBlock')
    ? [...fields, { key: 'hideBlock', label: 'Hide Block', mode: 'hide' as const }]
    : fields

  const content = (
    <div className="space-y-4">
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
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
    </div>
  )

  if (!useCard) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium">{title}</h3>
        {content}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <DashboardModalCardTitle>{title}</DashboardModalCardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
