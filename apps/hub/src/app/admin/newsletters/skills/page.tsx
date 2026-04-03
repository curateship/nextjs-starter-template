"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getNewsletterAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, Play, Settings, Wand2, Mail, Users, Filter, Zap, FileText, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getSkillsBySite,
  deleteSkill,
  generateOneOutput,
} from "@/lib/actions/newsletters/skill-actions"
import type { NewsletterSkill } from "@/lib/actions/newsletters/skill-actions"
import { useSiteSwitcher } from "@/components/admin/layout/site-switcher-provider"
import Link from "next/link"
import { SkillModal } from "@/components/admin/newsletter-skills/SkillModal"

// Skill with output counts from the API
type SkillWithCounts = NewsletterSkill & { pending_count: number; approved_count: number }

export default function SkillsPage() {
  const { currentSite } = useSiteSwitcher()
  const router = useRouter()
  const [skills, setSkills] = useState<SkillWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<NewsletterSkill | null>(null)
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)

  const [sortColumn, setSortColumn] = useState<'name' | 'pending' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadSkills()
  }, [currentSite?.id])

  // Load all skills for the current site
  async function loadSkills() {
    if (!currentSite?.id) {
      setLoading(true)
      setSkills([])
      return
    }

    try {
      setLoading(true)
      setError(null)
      const { data, error: loadError } = await getSkillsBySite(currentSite.id)
      if (loadError) {
        setError(loadError)
        setLoading(false)
        return
      }
      setSkills(data || [])
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills")
      setLoading(false)
    }
  }

  // Run a skill — navigates to the output page which handles generation
  function handleRun(skillId: string) {
    router.push(`/admin/newsletters/skills/${skillId}?run=true`)
  }

  // Delete selected skills
  async function handleMassDelete() {
    setMassDeleting(true)
    for (const id of selectedIds) {
      const { error: deleteError } = await deleteSkill(id)
      if (deleteError) {
        setError(deleteError)
        break
      }
    }
    setSelectedIds(new Set())
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    loadSkills()
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === skills.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(skills.map(s => s.id)))
    }
  }

  const toggleSort = (column: 'name' | 'pending' | 'modified') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedSkills = [...skills].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'pending') return (a.pending_count - b.pending_count) * dir
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <>
      <StickyHeader navLinks={getNewsletterAdminTopNavLinks()} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Create with AI" },
            ]}
            actions={
              <div className="flex items-center gap-1.5 sm:gap-3">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span className="hidden sm:inline">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                      </>
                    )}
                  </Button>
                )}
                <Button onClick={() => { setEditingSkill(null); setModalOpen(true) }}>
                  Create Skill
                </Button>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={skills.length > 0 && selectedIds.size === skills.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all skills"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Name</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('pending')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('pending')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div className="col-span-2">Actions</div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div className="h-4 bg-muted rounded animate-pulse w-40" />
                        </div>
                        <div><div className="h-4 bg-muted/60 rounded animate-pulse w-16" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-20" /></div>
                        <div className="col-span-2 flex gap-1">
                          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadSkills()} variant="outline" size="sm">Try Again</Button>
                </div>
              ) : skills.length === 0 ? (
                <div className="p-8 text-center">
                  <Wand2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No skills yet. Create a skill to batch-generate newsletters with AI.
                  </p>
                  <Button onClick={() => { setEditingSkill(null); setModalOpen(true) }} variant="outline">
                    Create Skill
                  </Button>
                </div>
              ) : (
                sortedSkills.map((skill) => (
                  <div key={skill.id} className={`p-6 transition-colors ${selectedIds.has(skill.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      {/* Name */}
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={selectedIds.has(skill.id)}
                          onCheckedChange={() => toggleSelect(skill.id)}
                          aria-label={`Select ${skill.name}`}
                        />
                        <Link
                          href={`/admin/newsletters/skills/${skill.id}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <h4 className="font-medium text-sm hover:underline">{skill.name}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{skill.prompt}</p>
                        </Link>
                      </div>

                      {/* Status badges */}
                      <div className="flex items-center gap-1.5">
                        {skill.pending_count > 0 && (
                          <Badge variant="secondary" className="text-xs">{skill.pending_count} pending</Badge>
                        )}
                        {skill.approved_count > 0 && (
                          <Badge className="text-xs bg-green-600">{skill.approved_count} approved</Badge>
                        )}
                        {skill.pending_count === 0 && skill.approved_count === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Modified */}
                      <div>
                        <span className="text-sm text-muted-foreground">{formatDate(skill.updated_at)}</span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRun(skill.id)}
                          disabled={runningSkillId === skill.id}
                          title="Run Skill"
                        >
                          {runningSkillId === skill.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline ml-1">
                            {runningSkillId === skill.id ? 'Running...' : 'Run'}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => { setEditingSkill(skill); setModalOpen(true) }}
                          title="Edit Skill"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Edit Skill</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => {
                            setSelectedIds(new Set([skill.id]))
                            setMassDeleteConfirmOpen(true)
                          }}
                          title="Delete Skill"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete Skill</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </AdminLayout>

      {/* Create/Edit Skill Modal */}
      <SkillModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        skill={editingSkill}
        siteId={currentSite?.id || ''}
        onSaved={loadSkills}
      />

      {/* Mass Delete Confirmation */}
      {massDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-[60]">
            <h2 className="text-lg font-semibold mb-2">Delete Skills</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete {selectedIds.size} skill{selectedIds.size !== 1 ? "s" : ""} and all their outputs? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
              <Button onClick={handleMassDelete} variant="destructive" disabled={massDeleting}>
                {massDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
