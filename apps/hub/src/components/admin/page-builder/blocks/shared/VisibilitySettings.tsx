import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

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
}

export function VisibilitySettings({
  visibility,
  onChange,
  fields,
  title = "Visibility",
  includeHideBlock = true,
}: VisibilitySettingsProps) {
  const resolvedFields = includeHideBlock && !fields.some((field) => field.key === 'hideBlock')
    ? [...fields, { key: 'hideBlock', label: 'Hide Block', mode: 'hide' as const }]
    : fields

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}
