import type * as React from "react"
import {
  FileTextIcon,
  ImageIcon,
  MinusIcon,
  MousePointerClickIcon,
  PanelBottomIcon,
} from "lucide-react"

import type { BroadcastBlockKind } from "@/lib/broadcasts/blocks"

/**
 * Each email block's icon, drawn beside its name wherever blocks are listed:
 * the editor's block palette, the + between blocks, and the CRM's
 * right-click list (Tyler, 7 Nov 2026: "these need icons beside it").
 */
export const BROADCAST_BLOCK_ICONS: Record<
  BroadcastBlockKind,
  React.ComponentType<{ className?: string }>
> = {
  header: ImageIcon,
  richText: FileTextIcon,
  button: MousePointerClickIcon,
  divider: MinusIcon,
  footer: PanelBottomIcon,
}
