import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Eye, Save } from "lucide-react"
import Link from "next/link"
import type { SiteWithTheme } from "@/lib/actions/site-actions"

interface SiteBuilderHeaderProps {
  site: SiteWithTheme
  selectedPage: string
  onPageChange: (page: string) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
}

export function SiteBuilderHeader({
  site,
  selectedPage,
  onPageChange,
  saveMessage,
  isSaving,
  onSave
}: SiteBuilderHeaderProps) {
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-15 z-40">
      <div className="flex h-16 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/sites">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sites
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">{site.name || 'Site Builder'}</h1>
          <div className="h-4 w-px bg-border"></div>
          <Select value={selectedPage} onValueChange={onPageChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="home">🏠 Home</SelectItem>
              <SelectItem value="about">📋 About</SelectItem>
              <SelectItem value="contact">📞 Contact</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Error') || saveMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMessage}
            </span>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link 
              href={`/${site.subdomain}`} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview Site
            </Link>
          </Button>
          <Button 
            size="sm" 
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}