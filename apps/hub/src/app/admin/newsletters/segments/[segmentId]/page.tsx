"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Mail, Users, Filter, Zap, FileText, Shield, Clock, Trash2, Plus, X, Search, Settings } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  getSegmentById,
  getSegmentStats,
  getSegmentContacts,
  getSegmentEngagementOverTime,
  getSegmentNewsletters,
  searchContactsForSegment,
  updateSegment,
  deleteSegments,
  removeContactsFromSegment,
  addContactsToSegment,
} from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"

export default function SegmentDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const segmentId = params.segmentId as string

  // Segment data
  const [segment, setSegment] = useState<Segment | null>(null)
  const [stats, setStats] = useState<{ totalContacts: number; totalSent: number; totalOpened: number; totalClicked: number; openRate: number; clickRate: number; unsubscribeRate: number; avgEngagementScore: number } | null>(null)
  const [contacts, setContacts] = useState<{ id: string; email: string; status: string; engagementScore: number; metadata: any; createdAt: string }[]>([])
  const [contactsTotal, setContactsTotal] = useState(0)
  const [contactsPage, setContactsPage] = useState(1)
  const [newsletters, setNewsletters] = useState<{ id: string; name: string; subject: string; status: string; sentAt: string | null; totalSent: number; totalOpened: number; totalClicked: number }[]>([])
  const [engagement, setEngagement] = useState<{ month: string; opens: number; clicks: number }[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({ name: "", description: "" })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Search contacts state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ id: string; email: string; metadata: any }[]>([])
  const [searching, setSearching] = useState(false)
  const [addingContact, setAddingContact] = useState<string | null>(null)

  // Load all data on mount
  useEffect(() => {
    if (segmentId) loadData()
  }, [segmentId])

  // Debounced search for contacts to add
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timeout = setTimeout(async () => {
      setSearching(true)
      const res = await searchContactsForSegment(segmentId, searchQuery)
      if (res.data) setSearchResults(res.data)
      setSearching(false)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery, segmentId])

  /** Fetch all segment data in parallel */
  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [segmentRes, statsRes, contactsRes, newslettersRes, engagementRes] = await Promise.all([
        getSegmentById(segmentId),
        getSegmentStats(segmentId),
        getSegmentContacts(segmentId, 1, 20),
        getSegmentNewsletters(segmentId),
        getSegmentEngagementOverTime(segmentId),
      ])

      if (segmentRes.error || !segmentRes.data) {
        setError(segmentRes.error || "Segment not found")
        setLoading(false)
        return
      }

      setSegment(segmentRes.data)
      setStats(statsRes.data)
      setContacts(contactsRes.data || [])
      setContactsTotal(contactsRes.total)
      setNewsletters(newslettersRes.data || [])
      setEngagement(engagementRes.data || [])

      // Populate edit form
      setEditForm({
        name: segmentRes.data.name,
        description: segmentRes.data.description,
      })
    } catch {
      setError("Failed to load segment data")
    } finally {
      setLoading(false)
    }
  }

  /** Load more contacts (pagination) */
  async function loadMoreContacts() {
    setLoadingMore(true)
    const nextPage = contactsPage + 1
    const res = await getSegmentContacts(segmentId, nextPage, 20)
    if (res.data) {
      setContacts(prev => [...prev, ...res.data!])
      setContactsPage(nextPage)
    }
    setLoadingMore(false)
  }

  /** Refresh contacts list and stats after add/remove */
  async function refreshContactsAndStats() {
    const [statsRes, contactsRes] = await Promise.all([
      getSegmentStats(segmentId),
      getSegmentContacts(segmentId, 1, 20),
    ])
    setStats(statsRes.data)
    setContacts(contactsRes.data || [])
    setContactsTotal(contactsRes.total)
    setContactsPage(1)
  }

  /** Save segment name/description edits */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!segment) return
    setSaving(true)

    const { data, error } = await updateSegment(segment.id, {
      name: editForm.name,
      description: editForm.description,
    })

    if (data) {
      setSegment(data)
      setSettingsOpen(false)
    }
    if (error) setError(error)
    setSaving(false)
  }

  /** Delete segment and redirect back to segments list */
  async function handleDelete() {
    if (!segment || deleting) return
    if (!confirm("Are you sure you want to delete this segment? This cannot be undone.")) return
    setDeleting(true)
    const { success, error } = await deleteSegments([segment.id])
    if (success) {
      router.push("/admin/newsletters/segments")
    } else {
      setError(error || "Failed to delete segment")
      setDeleting(false)
    }
  }

  /** Remove a contact from the segment */
  async function handleRemoveContact(contactId: string) {
    const { error } = await removeContactsFromSegment([contactId], segmentId)
    if (error) {
      setError(error)
      return
    }
    await refreshContactsAndStats()
  }

  /** Add a contact to the segment from search results */
  async function handleAddContact(contactId: string) {
    setAddingContact(contactId)
    const { error } = await addContactsToSegment([contactId], segmentId)
    if (error) {
      setError(error)
      setAddingContact(null)
      return
    }
    // Clear the added contact from results, refresh data
    setSearchResults(prev => prev.filter(c => c.id !== contactId))
    setSearchQuery("")
    setAddingContact(null)
    await refreshContactsAndStats()
  }

  // Helper: format date
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  // Helper: get contact display name from metadata
  function getContactName(metadata: any): string {
    const first = metadata?.first_name || ""
    const last = metadata?.last_name || ""
    return (first + " " + last).trim()
  }

  // Helper: status badge for contacts
  function getStatusBadge(status: string) {
    switch (status) {
      case "active": return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case "unsubscribed": return <Badge variant="secondary">Unsubscribed</Badge>
      case "bounced": return <Badge variant="destructive">Bounced</Badge>
      case "complained": return <Badge variant="destructive">Complained</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Nav links — Segments tab active
  const navLinks = [
    { label: "Newsletters", href: "/admin/newsletters", icon: Mail },
    { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users },
    { label: "Segments", href: "/admin/newsletters/segments", icon: Filter, active: true },
    { label: "Automations", href: "/admin/newsletters/automations", icon: Zap },
    { label: "Templates", href: "/admin/newsletters/templates", icon: FileText },
    { label: "Email Health", href: "/admin/newsletters/email-health", icon: Shield },
    { label: "Cron Jobs", href: "/admin/newsletters/cron", icon: Clock },
  ]

  return (
    <>
      <StickyHeader navLinks={navLinks} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            className="mt-2.5"
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Segments", href: "/admin/newsletters/segments" },
              { label: loading ? <span className="inline-block h-4 w-32 bg-muted rounded animate-pulse align-middle" /> : segment?.name || "Segment" },
            ]}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  disabled={loading}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting || loading}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            }
          />

          {/* Loading skeleton */}
          {loading && (
            <>
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-2 md:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} className="p-4">
                    <div className="h-4 w-20 bg-muted rounded animate-pulse mb-2" />
                    <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* Error state */}
          {error && !loading && (
            <Card className="p-8 text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Link href="/admin/newsletters/segments">
                <Button variant="outline">Back to Segments</Button>
              </Link>
            </Card>
          )}

          {/* Loaded content */}
          {!loading && segment && (
            <>
              {/* Segment Header */}
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  {/* Icon circle */}
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Filter className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold truncate">{segment.name}</h1>
                    <p className="text-sm text-muted-foreground truncate">
                      {stats?.totalContacts ?? 0} contacts{segment.description ? ` · ${segment.description}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">Created {formatDate(segment.created_at)}</span>
                </div>
              </Card>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Open Rate</p>
                  <p className="text-2xl font-semibold">{stats?.openRate ?? 0}%</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Click Rate</p>
                  <p className="text-2xl font-semibold">{stats?.clickRate ?? 0}%</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Avg Engagement</p>
                  <p className="text-2xl font-semibold">{stats?.avgEngagementScore ?? 0}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Unsubscribe Rate</p>
                  <p className="text-2xl font-semibold">{stats?.unsubscribeRate ?? 0}%</p>
                </Card>
              </div>

              {/* Two-column layout: Newsletters + Sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-3">
                {/* Newsletters — left 2/3 */}
                <Card className="lg:col-span-2 p-0">
                  <div className="px-6 py-4 border-b">
                    <h2 className="font-semibold text-sm">Newsletters</h2>
                  </div>
                  <div className="divide-y">
                    {newsletters.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        No newsletters sent to this segment yet.
                      </div>
                    ) : (
                      newsletters.map(nl => (
                        <div key={nl.id} className="px-6 py-3">
                          <p className="text-sm font-medium truncate">{nl.subject || nl.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">{nl.status}</Badge>
                            {nl.sentAt && <span>{formatDate(nl.sentAt)}</span>}
                            <span>·</span>
                            <span>{nl.totalSent} sent</span>
                            <span>·</span>
                            <span>{nl.totalOpened} opened ({nl.totalSent > 0 ? Math.round((nl.totalOpened / nl.totalSent) * 100) : 0}%)</span>
                            <span>·</span>
                            <span>{nl.totalClicked} clicked ({nl.totalSent > 0 ? Math.round((nl.totalClicked / nl.totalSent) * 100) : 0}%)</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* Right sidebar */}
                <div>
                  {/* Contacts list */}
                  <Card className="p-0">
                    <div className="px-6 py-4 border-b flex items-center justify-between">
                      <h2 className="font-semibold text-sm">Contacts ({contactsTotal})</h2>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" align="end">
                          {/* Search input */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              value={searchQuery}
                              onChange={e => setSearchQuery(e.target.value)}
                              placeholder="Search by email..."
                              className="pl-9 h-8 text-sm"
                              autoFocus
                            />
                          </div>
                          {/* Search results */}
                          <div className="mt-2">
                            {searching && (
                              <p className="text-xs text-muted-foreground py-2">Searching...</p>
                            )}
                            {searchResults.length > 0 && (
                              <div className="divide-y max-h-48 overflow-y-auto">
                                {searchResults.map(result => (
                                  <div key={result.id} className="py-2 flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate">{result.email}</p>
                                      {getContactName(result.metadata) && (
                                        <p className="text-xs text-muted-foreground truncate">{getContactName(result.metadata)}</p>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs shrink-0"
                                      onClick={() => handleAddContact(result.id)}
                                      disabled={addingContact === result.id}
                                    >
                                      <Plus className="h-3.5 w-3.5 mr-1" />
                                      {addingContact === result.id ? "..." : "Add"}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                              <p className="text-xs text-muted-foreground py-2">No contacts found</p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="divide-y">
                      {contacts.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          No contacts in this segment yet.
                        </div>
                      ) : (
                        contacts.map(contact => (
                          <div key={contact.id} className="px-6 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{contact.email}</p>
                              {getContactName(contact.metadata) && (
                                <p className="text-xs text-muted-foreground truncate">{getContactName(contact.metadata)}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {getStatusBadge(contact.status)}
                              {contact.engagementScore > 0 && (
                                <Badge variant="outline" className="text-xs">Score: {contact.engagementScore}</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                                onClick={() => handleRemoveContact(contact.id)}
                                title="Remove from segment"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Load more button */}
                    {contacts.length < contactsTotal && (
                      <div className="px-6 py-4 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadMoreContacts}
                          disabled={loadingMore}
                          className="w-full"
                        >
                          {loadingMore ? "Loading..." : `Load more (${contactsTotal - contacts.length} remaining)`}
                        </Button>
                      </div>
                    )}
                  </Card>
                </div>
              </div>

              {/* Engagement Over Time chart — only if 3+ data points */}
              {engagement.length >= 3 && (
                <Card className="p-0">
                  <div className="px-6 py-4 border-b">
                    <h2 className="font-semibold text-sm">Engagement Over Time</h2>
                  </div>
                  <div className="px-6 py-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={engagement}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="opens" stroke="#3b82f6" name="Opens" />
                        <Line type="monotone" dataKey="clicks" stroke="#22c55e" name="Clicks" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </AdminLayout>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader className="mb-6">
            <DialogTitle>Segment Settings</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <Label htmlFor="segment-name">Name</Label>
              <Input
                id="segment-name"
                value={editForm.name}
                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Segment name"
              />
            </div>
            <div>
              <Label htmlFor="segment-description">Description</Label>
              <Textarea
                id="segment-description"
                value={editForm.description}
                onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Segment description"
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" type="button" onClick={() => setSettingsOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !editForm.name.trim()}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
