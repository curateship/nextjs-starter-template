import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface VisibilityField {
  key: string
  label: string
}

interface VisibilitySettingsProps {
  visibility: Record<string, boolean> | undefined
  onChange: (visibility: Record<string, boolean>) => void
  fields: VisibilityField[]
}

export function VisibilitySettings({ visibility, onChange, fields }: VisibilitySettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Element Visibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center justify-between">
            <Label htmlFor={`visibility-${field.key}`}>{field.label}</Label>
            <Switch
              id={`visibility-${field.key}`}
              checked={visibility?.[field.key] !== false}
              onCheckedChange={(checked) => {
                onChange({
                  ...visibility,
                  [field.key]: checked,
                })
              }}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Toggle elements on or off without deleting their content.
        </p>
      </CardContent>
    </Card>
  )
}
