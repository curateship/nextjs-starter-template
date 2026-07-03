import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TEXT_FONTS, type TextFontId } from "@/lib/text-fonts"

export function TextFontSelect({
  id,
  value,
  disabled,
  triggerClassName,
  onChange,
}: {
  id?: string
  value: TextFontId
  disabled?: boolean
  triggerClassName?: string
  onChange: (value: TextFontId) => void
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as TextFontId)}
    >
      <SelectTrigger id={id} className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TEXT_FONTS.map((font) => (
          <SelectItem key={font.id} value={font.id}>
            <span style={{ fontFamily: font.family, fontWeight: font.weight }}>
              {font.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
