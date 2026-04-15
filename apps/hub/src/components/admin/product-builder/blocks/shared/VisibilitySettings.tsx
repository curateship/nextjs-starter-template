import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { BlockEditorSection } from "@/components/admin/shared/BlockTabs"

interface VisibilityField {
  key: string
  label: string
}

interface VisibilitySettingsProps {
  visibility: Record<string, boolean> | undefined
  onChange: (visibility: Record<string, boolean>) => void
  fields: VisibilityField[]
  title?: string
  useCard?: boolean
}

export function VisibilitySettings({
  visibility,
  onChange,
  fields,
  title = "Header Visibility",
  useCard = false,
}: VisibilitySettingsProps) {
  const content = (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.key} className="flex items-center space-x-2">
          <Checkbox
            id={`visibility-${field.key}`}
            checked={visibility?.[field.key] !== false}
            onCheckedChange={(checked) => {
              onChange({
                ...visibility,
                [field.key]: !!checked,
              })
            }}
          />
          <Label htmlFor={`visibility-${field.key}`} className="cursor-pointer">{field.label}</Label>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Toggle elements on or off without deleting their content.
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
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
