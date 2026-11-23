import * as React from "react"
import { ImageUpIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DEFAULT_BRAND_NAME, MAX_LOGO_CHARS, parseAppUrl, type Brand } from "@/lib/menu"

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]

/** Personal's own logo, with its white version for dark mode, or the chosen picture. */
export function BrandLogo({ logo }: { logo: string | undefined }) {
  if (logo) return <img src={logo} alt="" className="size-6 shrink-0 object-contain" />
  return (
    <>
      <img src="/logo.png" alt="" className="size-6 shrink-0 dark:hidden" />
      <img src="/logo-dark.png" alt="" className="hidden size-6 shrink-0 dark:block" />
    </>
  )
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * The form behind the logo row's cog: the name, the logo picture, and the
 * screen a click on them opens. An empty address keeps the start page.
 */
export function BrandEditor({
  brand,
  openUrl,
  onSubmit,
  onCancel,
}: {
  brand: Brand | undefined
  /** The screen open in the middle panel, offered as the address. */
  openUrl: string | null
  onSubmit: (brand: Brand | undefined) => void
  onCancel: () => void
}) {
  const id = React.useId()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [name, setName] = React.useState(brand?.name ?? DEFAULT_BRAND_NAME)
  const [logo, setLogo] = React.useState(brand?.logo)
  const [url, setUrl] = React.useState(brand?.url ?? "")
  const [errors, setErrors] = React.useState<{ name?: string; logo?: string; url?: string }>({})

  async function pickLogo(file: File | undefined) {
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) {
      setErrors({ ...errors, logo: "Use a PNG, JPG, WebP, GIF or SVG picture." })
      return
    }
    const data = await readAsDataUrl(file)
    if (data.length > MAX_LOGO_CHARS) {
      setErrors({ ...errors, logo: "That picture is too big. Use one under 190 KB." })
      return
    }
    setErrors({ ...errors, logo: undefined })
    setLogo(data)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = {
      name: name.trim() ? undefined : "Give it a name.",
      url:
        !url.trim() || parseAppUrl(url)
          ? undefined
          : "Use a full address, such as http://localhost:3020/dashboard, or leave it empty.",
    }
    setErrors(next)
    if (next.name || next.url) return
    const chosen: Brand = {
      name: name.trim(),
      ...(logo ? { logo } : {}),
      ...(url.trim() ? { url: parseAppUrl(url)!.href } : {}),
    }
    // Personal's own name, logo and start page are the same as choosing nothing.
    const isDefault = chosen.name === DEFAULT_BRAND_NAME && !chosen.logo && !chosen.url
    onSubmit(isDefault ? undefined : chosen)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          autoFocus
          value={name}
          maxLength={40}
          aria-invalid={Boolean(errors.name)}
          onChange={(event) => {
            setName(event.target.value)
            setErrors({ ...errors, name: undefined })
          }}
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-logo`}>Logo</Label>
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border">
            <BrandLogo logo={logo} />
          </span>
          <Button
            id={`${id}-logo`}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <ImageUpIcon />
            Upload picture
          </Button>
          {logo ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(undefined)}>
              <RotateCcwIcon />
              Personal logo
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept={LOGO_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              void pickLogo(event.target.files?.[0])
              event.target.value = ""
            }}
          />
        </div>
        {errors.logo ? <p className="text-xs text-destructive">{errors.logo}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-url`}>Opens</Label>
          {openUrl && openUrl !== url ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setUrl(openUrl)}
            >
              Use the open page
            </Button>
          ) : null}
        </div>
        <Input
          id={`${id}-url`}
          value={url}
          placeholder="Personal's start page"
          aria-invalid={Boolean(errors.url)}
          onChange={(event) => {
            setUrl(event.target.value)
            setErrors({ ...errors, url: undefined })
          }}
        />
        {errors.url ? <p className="text-xs text-destructive">{errors.url}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  )
}
