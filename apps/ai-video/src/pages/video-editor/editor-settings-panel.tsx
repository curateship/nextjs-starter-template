import {
  CaptionsIcon,
  ImageIcon,
  MusicIcon,
  ShapesIcon,
  SparklesIcon,
  TypeIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

// Building blocks the editor will support; tiles are inert in the UI-only build.
const ELEMENT_TILES: { label: string; icon: LucideIcon }[] = [
  { label: "Text", icon: TypeIcon },
  { label: "Image", icon: ImageIcon },
  { label: "Video", icon: VideoIcon },
  { label: "Audio", icon: MusicIcon },
  { label: "Captions", icon: CaptionsIcon },
  { label: "Shapes", icon: ShapesIcon },
]

// Right panel: element library + AI generation settings. All controls are
// static placeholders — no generation backend is wired up yet.
export function EditorSettingsPanel() {
  return (
    <section className="hidden w-[330px] shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/40 lg:flex">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Element tiles */}
        <div>
          <h2 className="text-sm font-semibold">Elements</h2>
          <p className="text-xs text-muted-foreground">
            Building blocks for your video.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {ELEMENT_TILES.map((tile) => (
              <button
                key={tile.label}
                type="button"
                className="flex flex-col items-center gap-1.5 rounded-lg border bg-background p-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                <tile.icon className="size-4 text-muted-foreground" />
                {tile.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* AI generation form (static) */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">AI Generation</h2>
            <p className="text-xs text-muted-foreground">
              Generate clips from a prompt.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <Select defaultValue="veo-3">
              <SelectTrigger id="ai-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="veo-3">Veo 3</SelectItem>
                <SelectItem value="sora-2">Sora 2</SelectItem>
                <SelectItem value="runway-gen-4">Runway Gen-4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-style">Style</Label>
            <Select defaultValue="cinematic">
              <SelectTrigger id="ai-style" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="photoreal">Photoreal</SelectItem>
                <SelectItem value="anime">Anime</SelectItem>
                <SelectItem value="3d">3D Render</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt">Prompt</Label>
            <Textarea
              id="ai-prompt"
              rows={4}
              placeholder="Describe the clip you want to generate..."
            />
          </div>
          <Button type="button" className="w-full">
            <SparklesIcon data-icon="inline-start" />
            Generate
          </Button>
        </div>
      </div>
    </section>
  )
}
