import { Blocks, FolderOpen } from "lucide-react"

export function getDirectoryAdminNavLinks(active: 'directory' | 'custom-blocks') {
  return [
    {
      label: 'Directory',
      href: '/admin/directories',
      icon: FolderOpen,
      active: active === 'directory',
    },
    {
      label: 'Custom Blocks',
      href: '/admin/directories/custom-blocks',
      icon: Blocks,
      active: active === 'custom-blocks',
    },
  ]
}
