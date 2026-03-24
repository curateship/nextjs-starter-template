"use client"

import { useState, useEffect } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Mail, Users, Filter, Zap, FileText, Trash2, ExternalLink } from "lucide-react"
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
  getContactById,
  getContactStats,
  getContactEvents,
  getContactSegments,
  getContactClickedLinks,
  getContactEngagementOverTime,
  updateContact,
  deleteContacts,
} from "@/lib/actions/newsletters/contact-actions"
import type { CrmContact } from "@/lib/actions/newsletters/contact-actions"

export default function ContactDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const contactId = params.contactId as string

  // Contact data
  const [contact, setContact] = useState<CrmContact | null>(null)
  const [stats, setStats] = useState<{ totalSent: number; totalOpened: number; totalClicked: number; openRate: number; clickRate: number } | null>(null)
  const [events, setEvents] = useState<{ id: string; eventType: string; sourceId: string | null; newsletterSubject: string | null; metadata: any; createdAt: string }[]>([])
  const [eventsTotal, setEventsTotal] = useState(0)
  const [eventsPage, setEventsPage] = useState(1)
  const [segments, setSegments] = useState<{ id: string; name: string }[]>([])
  const [clickedLinks, setClickedLinks] = useState<{ id: string; linkUrl: string; newsletterSubject: string | null; createdAt: string }[]>([])
  const [engagement, setEngagement] = useState<{ month: string; opens: number; clicks: number }[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", tags: "", status: "active" })
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Load all data on mount
  useEffect(() => {
    if (contactId) loadData()
  }, [contactId])

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      // Fetch all data in parallel
      const [contactRes, statsRes, eventsRes, segmentsRes, linksRes, engagementRes] = await Promise.all([
        getContactById(contactId),
        getContactStats(contactId),
        getContactEvents(contactId, 1, 20),
        getContactSegments(contactId),
        getContactClickedLinks(contactId),
        getContactEngagementOverTime(contactId),
      ])

      if (contactRes.error || !contactRes.data) {
        setError(contactRes.error || "Contact not found")
        setLoading(false)
        return
      }

      setContact(contactRes.data)
      setStats(statsRes.data)
      setEvents(eventsRes.data || [])
      setEventsTotal(eventsRes.total)
      setSegments(segmentsRes.data || [])
      setClickedLinks(linksRes.data || [])
      setEngagement(engagementRes.data || [])

      // Populate edit form from contact data
      setEditForm({
        first_name: contactRes.data.metadata?.first_name || "",
        last_name: contactRes.data.metadata?.last_name || "",
        tags: contactRes.data.metadata?.tags?.join(", ") || "",
        status: contactRes.data.status,
      })
    } catch {
      setError("Failed to load contact data")
    } finally {
      setLoading(false)
    }
  }

  // Load more events (pagination)
  async function loadMoreEvents() {
    setLoadingMore(true)
    const nextPage = eventsPage + 1
    const res = await getContactEvents(contactId, nextPage, 20)
    if (res.data) {
      setEvents(prev => [...prev, ...res.data!])
      setEventsPage(nextPage)
    }
    setLoadingMore(false)
  }

  // Save contact edits
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!contact) return
    setSaving(true)
    setSaveSuccess(false)

    const tags = editForm.tags ? editForm.tags.split(",").map(t => t.trim()).filter(Boolean) : []
    const { data, error } = await updateContact(contact.id, {
      metadata: {
        first_name: editForm.first_name || undefined,
        last_name: editForm.last_name || undefined,
        tags,
      },
      status: editForm.status as CrmContact["status"],
    })

    if (data) {
      setContact(data)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    if (error) setError(error)
    setSaving(false)
  }

  // Delete contact and redirect back to contacts list
  async function handleDelete() {
    if (!contact || deleting) return
    if (!confirm("Are you sure you want to delete this contact? This cannot be undone.")) return
    setDeleting(true)
    const { success, error } = await deleteContacts([contact.id])
    if (success) {
      router.push("/admin/newsletters/contacts")
    } else {
      setError(error || "Failed to delete contact")
      setDeleting(false)
    }
  }

  // Helper: format date relative (e.g. "3d ago") or absolute
  function formatRelativeDate(dateStr: string | null): string {
    if (!dateStr) return "Never"
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "1d ago"
    if (diffDays < 30) return `${diffDays}d ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  // Helper: format date for display
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  // Helper: get initials for avatar
  function getInitials(): string {
    if (!contact) return "?"
    const first = contact.metadata?.first_name?.[0] || ""
    const last = contact.metadata?.last_name?.[0] || ""
    if (first || last) return (first + last).toUpperCase()
    return contact.email[0].toUpperCase()
  }

  // Helper: get status badge
  function getStatusBadge(status: string) {
    switch (status) {
      case "active": return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case "unsubscribed": return <Badge variant="secondary">Unsubscribed</Badge>
      case "bounced": return <Badge variant="destructive">Bounced</Badge>
      case "complained": return <Badge variant="destructive">Complained</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Helper: get source badge
  function getSourceBadge(source: string) {
    switch (source) {
      case "lead_magnet": return <Badge variant="outline">Lead Magnet</Badge>
      case "paid_purchase": return <Badge variant="outline" className="border-green-200 text-green-700">Purchase</Badge>
      case "import": return <Badge variant="outline" className="border-blue-200 text-blue-700">Import</Badge>
      case "manual": return <Badge variant="outline">Manual</Badge>
      case "ad": return <Badge variant="outline" className="border-purple-200 text-purple-700">Ad</Badge>
      default: return <Badge variant="outline">{source}</Badge>
    }
  }

  // Helper: get event type display with color
  function getEventBadge(eventType: string) {
    switch (eventType) {
      case "sent": return <Badge variant="secondary" className="text-xs">Sent</Badge>
      case "opened": return <Badge className="bg-blue-100 text-blue-800 text-xs">Opened</Badge>
      case "clicked": return <Badge className="bg-green-100 text-green-800 text-xs">Clicked</Badge>
      case "bounced": return <Badge variant="destructive" className="text-xs">Bounced</Badge>
      case "complained": return <Badge variant="destructive" className="text-xs">Complained</Badge>
      default: return <Badge variant="secondary" className="text-xs">{eventType}</Badge>
    }
  }

  // Group events by newsletter (sourceId) for the timeline
  function groupEventsByNewsletter() {
    const groups: Record<string, { subject: string; events: typeof events }> = {}
    for (const event of events) {
      const key = event.sourceId || event.id
      if (!groups[key]) {
        groups[key] = { subject: event.newsletterSubject || "Unknown", events: [] }
      }
      groups[key].events.push(event)
    }
    return Object.values(groups)
  }

  // Contact display name
  const displayName = contact
    ? (contact.metadata?.first_name || contact.metadata?.last_name
        ? `${contact.metadata.first_name || ""} ${contact.metadata.last_name || ""}`.trim()
        : contact.email)
    : ""

  // Nav links (same as contacts list page)
  const navLinks = [
    { label: "Newsletters", href: "/admin/newsletters", icon: Mail },
    { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users, active: true },
    { label: "Segments", href: "/admin/newsletters/segments", icon: Filter },
    { label: "Automations", href: "/admin/newsletters/automations", icon: Zap },
    { label: "Templates", href: "/admin/newsletters/templates", icon: FileText },
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
              { label: "Contacts", href: "/admin/newsletters/contacts" },
              { label: loading ? <span className="inline-block h-4 w-32 bg-muted rounded animate-pulse align-middle" /> : displayName },
            ]}
            actions={
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || loading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {deleting ? "Deleting..." : "Delete"}
              </Button>
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
              <Link href="/admin/newsletters/contacts">
                <Button variant="outline">Back to Contacts</Button>
              </Link>
            </Card>
          )}

          {/* Loaded content */}
          {!loading && contact && (
            <>
              {/* Contact Header */}
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  {/* Avatar circle with initials */}
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg shrink-0">
                    {getInitials()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold truncate">{displayName}</h1>
                    <p className="text-sm text-muted-foreground truncate">{contact.email}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {getStatusBadge(contact.status)}
                    {getSourceBadge(contact.metadata?.source || "manual")}
                    {contact.engagement_score > 0 && (
                      <Badge variant="outline" className="text-xs">Score: {contact.engagement_score}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">Since {formatDate(contact.created_at)}</span>
                  </div>
                </div>
              </Card>

              {/* Stats cards */}
              <div className="grid grid-cols-2 md:grid-cols-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Emails Received</p>
                  <p className="text-2xl font-semibold">{stats?.totalSent ?? 0}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Open Rate</p>
                  <p className="text-2xl font-semibold">{stats?.openRate ?? 0}%</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Click Rate</p>
                  <p className="text-2xl font-semibold">{stats?.clickRate ?? 0}%</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Last Engaged</p>
                  <p className="text-2xl font-semibold">{formatRelativeDate(contact.last_engaged_at)}</p>
                </Card>
              </div>

              {/* Two-column layout: Email History + Details */}
              <div className="grid grid-cols-1 lg:grid-cols-3">
                {/* Email History — left 2/3 */}
                <Card className="lg:col-span-2 p-0">
                  <div className="px-6 py-4 border-b">
                    <h2 className="font-semibold text-sm">Email History</h2>
                  </div>
                  <div className="divide-y">
                    {events.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        No email events recorded yet.
                      </div>
                    ) : (
                      groupEventsByNewsletter().map((group, i) => (
                        <div key={i} className="px-6 py-4">
                          <p className="font-medium text-sm mb-1">{group.subject}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">{formatDate(group.events[0].createdAt)}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            {/* Show event chain: sent → opened → clicked */}
                            {group.events
                              .sort((a, b) => {
                                const order = ["sent", "opened", "clicked", "bounced", "complained"]
                                return order.indexOf(a.eventType) - order.indexOf(b.eventType)
                              })
                              .map((event, j) => (
                                <span key={event.id} className="flex items-center gap-1">
                                  {j > 0 && <span className="text-xs text-muted-foreground">→</span>}
                                  {getEventBadge(event.eventType)}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Load more button */}
                  {events.length < eventsTotal && (
                    <div className="px-6 py-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreEvents}
                        disabled={loadingMore}
                        className="w-full"
                      >
                        {loadingMore ? "Loading..." : `Load more (${eventsTotal - events.length} remaining)`}
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Right sidebar — Details, Segments, Clicked Links */}
                <div>
                  {/* Edit Details */}
                  <Card className="p-0">
                    <div className="px-6 py-4 border-b">
                      <h2 className="font-semibold text-sm">Details</h2>
                    </div>
                    <form onSubmit={handleSave} className="px-6 py-4 space-y-4">
                      <div>
                        <Label className="text-xs mb-1 block">First Name</Label>
                        <Input
                          value={editForm.first_name}
                          onChange={e => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Last Name</Label>
                        <Input
                          value={editForm.last_name}
                          onChange={e => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                          placeholder="Last name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Status</Label>
                        <Select value={editForm.status} onValueChange={v => setEditForm(prev => ({ ...prev, status: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                            <SelectItem value="bounced">Bounced</SelectItem>
                            <SelectItem value="complained">Complained</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Tags</Label>
                        <Input
                          value={editForm.tags}
                          onChange={e => setEditForm(prev => ({ ...prev, tags: e.target.value }))}
                          placeholder="tag1, tag2, tag3"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Separate with commas</p>
                      </div>
                      <Button type="submit" disabled={saving} className="w-full">
                        {saving ? "Saving..." : saveSuccess ? "Saved!" : "Save Changes"}
                      </Button>
                    </form>
                  </Card>

                  {/* Segments */}
                  <Card className="p-0">
                    <div className="px-6 py-4 border-b">
                      <h2 className="font-semibold text-sm">Segments</h2>
                    </div>
                    <div className="px-6 py-4">
                      {segments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Not in any segments</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {segments.map(seg => (
                            <Badge key={seg.id} variant="secondary">{seg.name}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Clicked Links */}
                  <Card className="p-0">
                    <div className="px-6 py-4 border-b">
                      <h2 className="font-semibold text-sm">Clicked Links</h2>
                    </div>
                    <div className="divide-y">
                      {clickedLinks.length === 0 ? (
                        <div className="px-6 py-4">
                          <p className="text-sm text-muted-foreground">No clicks recorded</p>
                        </div>
                      ) : (
                        clickedLinks.map(link => (
                          <div key={link.id} className="px-6 py-3">
                            <div className="flex items-start gap-2">
                              <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="text-sm truncate">{link.linkUrl || "Unknown URL"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {link.newsletterSubject && <span>{link.newsletterSubject} · </span>}
                                  {formatDate(link.createdAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
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
    </>
  )
}
