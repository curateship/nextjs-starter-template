"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/newsletter-builder/layout/StickyHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import {
  getAutomationById,
  updateAutomation,
  createStep,
  updateStep,
  deleteStep,
  reorderSteps,
} from "@/lib/actions/newsletters/automation-actions"
import type { EmailAutomation, AutomationStep } from "@/lib/actions/newsletters/automation-actions"
import { Plus, Trash2, Clock, Zap, Mail, Target } from "lucide-react"

interface PageProps {
  params: Promise<{ automationId: string }>
}

export default function AutomationBuilderPage({ params }: PageProps) {
  const { automationId } = use(params)
  const router = useRouter()

  const [automation, setAutomation] = useState<EmailAutomation | null>(null)
  const [nodes, setNodes] = useState<AutomationStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Add node picker
  const [addAfterIndex, setAddAfterIndex] = useState<number | null>(null)

  // Edit email node
  const [editingEmail, setEditingEmail] = useState<AutomationStep | null>(null)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailContent, setEmailContent] = useState({ content: "" })
  const [savingNode, setSavingNode] = useState(false)

  // Edit delay node
  const [editingDelay, setEditingDelay] = useState<AutomationStep | null>(null)
  const [delayType, setDelayType] = useState("amount_of_time")
  const [delayValue, setDelayValue] = useState("1")
  const [delayUnit, setDelayUnit] = useState("days")
  const [delayDay, setDelayDay] = useState("1")
  const [delayTime, setDelayTime] = useState("09:00")
  const [delayDate, setDelayDate] = useState("")

  useEffect(() => { loadAutomation() }, [automationId])

  async function loadAutomation() {
    setLoading(true)
    const { data, steps, error } = await getAutomationById(automationId)
    if (error || !data) { setError(error || "Not found"); setLoading(false); return }
    setAutomation(data)
    setNodes(steps || [])
    setLoading(false)
  }

  const handleStatusToggle = async () => {
    if (!automation) return
    setSaving(true)
    const newStatus = automation.status === 'active' ? 'paused' : 'active'
    const { data } = await updateAutomation(automation.id, { status: newStatus })
    if (data) setAutomation(data)
    setSaving(false)
  }

  // --- Add Node ---
  // Don't create the node until the user saves from the modal.
  // The add button just opens the editor with a pending insert position.
  const [pendingNodeType, setPendingNodeType] = useState<'email' | 'delay' | null>(null)
  const [pendingInsertIndex, setPendingInsertIndex] = useState(0)

  const handleAddNode = (nodeType: 'email' | 'delay', afterIndex: number) => {
    setAddAfterIndex(null)
    setPendingNodeType(nodeType)
    setPendingInsertIndex(afterIndex)

    if (nodeType === 'email') {
      setEditingEmail(null) // clear any existing
      setEmailSubject('New Email')
      setEmailContent({ content: '' })
      // Use a sentinel to indicate "new"
      setEditingEmail({ id: '__new__' } as AutomationStep)
    } else {
      setEditingDelay(null)
      setDelayType('amount_of_time')
      setDelayValue('1')
      setDelayUnit('days')
      setDelayDay('1')
      setDelayTime('09:00')
      setDelayDate('')
      setEditingDelay({ id: '__new__' } as AutomationStep)
    }
  }

  const createAndInsertNode = async (nodeType: 'email' | 'delay', nodeData: Partial<AutomationStep>) => {
    if (!automation) return null
    const tempOrder = 99999 + Math.floor(Math.random() * 1000)

    const { data, error: createError } = await createStep({
      automationId: automation.id,
      stepOrder: tempOrder,
      nodeType,
      subject: nodeData.subject || undefined,
      content: nodeData.content || undefined,
      nodeConfig: nodeData.node_config || {},
      delayMinutes: nodeData.delay_minutes || 0,
    })

    if (createError || !data) {
      setError(createError || 'Failed to create node')
      return null
    }

    // Insert at position and reorder
    const sorted = [...nodes].sort((a, b) => a.step_order - b.step_order)
    const newOrder = [...sorted.slice(0, pendingInsertIndex), data, ...sorted.slice(pendingInsertIndex)]
    setNodes(newOrder)
    await reorderSteps(automation.id, newOrder.map(n => n.id))

    return data
  }

  // --- Email Editor ---
  const openEmailEditor = (node: AutomationStep) => {
    setEditingEmail(node)
    setEmailSubject(node.subject || "")
    setEmailContent({ content: node.content || "" })
  }

  const saveEmailNode = async () => {
    if (!editingEmail) return
    setSavingNode(true)

    if (editingEmail.id === '__new__') {
      const data = await createAndInsertNode('email', {
        subject: emailSubject,
        content: emailContent.content,
      })
      if (data) flash("Added")
    } else {
      const { data, error } = await updateStep(editingEmail.id, {
        subject: emailSubject,
        content: emailContent.content,
      })
      if (data) {
        setNodes(prev => prev.map(n => n.id === data.id ? data : n))
        flash("Saved")
      }
      if (error) setError(error)
    }

    setEditingEmail(null)
    setPendingNodeType(null)
    setSavingNode(false)
  }

  // --- Delay Editor ---
  const openDelayEditor = (node: AutomationStep) => {
    setEditingDelay(node)
    const cfg = node.node_config || {}
    setDelayType(cfg.delay_type || "amount_of_time")
    setDelayValue(String(cfg.delay_value || 1))
    setDelayUnit(cfg.delay_unit || "days")
    setDelayDay(String(cfg.day ?? 1))
    setDelayTime(cfg.time || "09:00")
    setDelayDate(cfg.date || "")
  }

  const saveDelayNode = async () => {
    if (!editingDelay) return
    setSavingNode(true)

    const config: Record<string, any> = { delay_type: delayType }
    let minutes = 0

    if (delayType === 'amount_of_time') {
      const val = parseInt(delayValue) || 1
      config.delay_value = val
      config.delay_unit = delayUnit
      minutes = delayUnit === 'days' ? val * 1440 : delayUnit === 'hours' ? val * 60 : val
    } else if (delayType === 'day_of_week') {
      config.day = parseInt(delayDay)
      minutes = 1440
    } else if (delayType === 'time_of_day') {
      config.time = delayTime
      minutes = 60
    } else if (delayType === 'specific_date') {
      config.date = delayDate
      minutes = 1440
    }

    if (editingDelay.id === '__new__') {
      const data = await createAndInsertNode('delay', {
        node_config: config,
        delay_minutes: minutes,
      })
      if (data) flash("Added")
    } else {
      const { data, error } = await updateStep(editingDelay.id, {
        node_config: config,
        delay_minutes: minutes,
      })
      if (data) {
        setNodes(prev => prev.map(n => n.id === data.id ? data : n))
        flash("Saved")
      }
      if (error) setError(error)
    }

    setEditingDelay(null)
    setPendingNodeType(null)
    setSavingNode(false)
  }

  const handleDeleteNode = async (nodeId: string) => {
    const { success } = await deleteStep(nodeId)
    if (success) {
      setNodes(prev => prev.filter(n => n.id !== nodeId))
      if (editingEmail?.id === nodeId) setEditingEmail(null)
      if (editingDelay?.id === nodeId) setEditingDelay(null)
    }
  }

  const flash = (msg: string) => { setSaveMessage(msg); setTimeout(() => setSaveMessage(null), 3000) }

  const formatDelay = (node: AutomationStep) => {
    const cfg = node.node_config || {}
    const type = cfg.delay_type || 'amount_of_time'
    if (type === 'amount_of_time') {
      const v = cfg.delay_value || 0
      const u = cfg.delay_unit || 'minutes'
      return `Wait ${v} ${u}`
    }
    if (type === 'day_of_week') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return `Wait until ${days[cfg.day as number] || 'Monday'}`
    }
    if (type === 'time_of_day') return `Wait until ${cfg.time || '09:00'}`
    if (type === 'specific_date') return `Wait until ${cfg.date || 'date'}`
    return 'Wait'
  }

  const AddNodeButton = ({ afterIndex }: { afterIndex: number }) => (
    <div className="flex flex-col items-center">
      <div className="w-px h-6 bg-border" />
      {addAfterIndex === afterIndex ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleAddNode('delay', afterIndex)}>
            <Clock className="h-3 w-3 mr-1" /> Time Delay
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleAddNode('email', afterIndex)}>
            <Mail className="h-3 w-3 mr-1" /> Email
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddAfterIndex(null)}>✕</Button>
        </div>
      ) : (
        <button
          onClick={() => setAddAfterIndex(afterIndex)}
          className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
      <div className="w-px h-6 bg-border" />
    </div>
  )

  if (loading) {
    return (
      <>
        <StickyHeader
          breadcrumbItems={[{ href: "/admin", label: "Dashboard" }, { href: "/admin/newsletters/automations", label: "Automations" }, { label: "Loading...", isPage: true }]}
          rightActions={
            <>
              <div className="h-6 w-16 bg-muted rounded-full animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            </>
          }
        />
        <AdminLayout>
          <div className="w-full max-w-2xl mx-auto px-6 py-8">
            <div className="flex flex-col items-center">
              {/* Trigger skeleton */}
              <div className="h-10 w-48 bg-muted rounded-xl animate-pulse" />
              <div className="w-px h-6 bg-border" />
              <div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
              <div className="w-px h-6 bg-border" />
              {/* Node skeletons */}
              {[1, 2, 3].map(i => (
                <div key={i} className="w-full flex flex-col items-center">
                  <Card className="w-full p-4 border-l-4 border-l-muted">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
                      <div className="flex-1">
                        <div className="h-3 w-16 bg-muted rounded animate-pulse mb-2" />
                        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  </Card>
                  <div className="w-px h-6 bg-border" />
                  <div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
                  <div className="w-px h-6 bg-border" />
                </div>
              ))}
            </div>
          </div>
        </AdminLayout>
      </>
    )
  }

  if (!automation) {
    return (
      <>
        <StickyHeader breadcrumbItems={[{ href: "/admin", label: "Dashboard" }, { href: "/admin/newsletters/automations", label: "Automations" }, { label: "Error", isPage: true }]} />
        <AdminLayout><div className="w-full p-8 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => router.push("/admin/newsletters/automations")} variant="outline">Back</Button>
        </div></AdminLayout>
      </>
    )
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters/automations", label: "Automations" },
          { label: automation.name, isPage: true },
        ]}
        rightActions={
          <>
            {saveMessage && <span className="text-sm text-green-600">{saveMessage}</span>}
            <Badge variant={automation.status === 'active' ? "default" : "secondary"} className={automation.status === 'active' ? "bg-green-100 text-green-800" : ""}>
              {automation.status === 'active' ? 'Active' : automation.status === 'paused' ? 'Paused' : 'Draft'}
            </Badge>
            <Button
              size="sm"
              variant={automation.status === 'active' ? "destructive" : "default"}
              onClick={handleStatusToggle}
              disabled={saving || nodes.filter(n => n.node_type === 'email').length === 0}
            >
              {automation.status === 'active' ? 'Pause' : 'Activate'}
            </Button>
          </>
        }
      />
      <AdminLayout>
        <div className="w-full max-w-2xl mx-auto px-6 py-8">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Trigger Node */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 px-5 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
              <Zap className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">
                {automation.trigger_type === 'lead_magnet_signup' ? 'Lead Magnet Signup' : 'Paid Purchase'}
              </span>
            </div>
          </div>

          {/* Add first node */}
          <AddNodeButton afterIndex={0} />

          {/* Node List */}
          {nodes.map((node, i) => (
            <div key={node.id} className="flex flex-col items-center">
              {/* Node Card */}
              {node.node_type === 'delay' ? (
                <Card
                  className="w-full p-4 cursor-pointer hover:border-primary/50 transition-colors border-l-4 border-l-yellow-400"
                  onClick={() => openDelayEditor(node)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase">Time Delay</p>
                        <p className="text-sm font-medium">{formatDelay(node)}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id) }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card
                  className="w-full p-4 cursor-pointer hover:border-primary/50 transition-colors border-l-4 border-l-blue-400"
                  onClick={() => openEmailEditor(node)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase">Send Email</p>
                        <p className="text-sm font-medium">{node.subject || "No subject"}</p>
                        {node.content && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {node.content.replace(/<[^>]*>/g, '').slice(0, 80)}{node.content.length > 80 ? '...' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id) }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              )}

              {/* Add node between */}
              <AddNodeButton afterIndex={i + 1} />
            </div>
          ))}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              Add your first node to start building the sequence.
            </div>
          )}
        </div>

        {/* Email Editor Modal */}
        <Dialog open={editingEmail !== null} onOpenChange={(open) => { if (!open) { setEditingEmail(null); setPendingNodeType(null) } }}>
          <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
            <DialogHeader className="mb-6">
              <DialogTitle>Edit Email</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <Label>Subject Line *</Label>
                <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject" />
              </div>
              <div>
                <Label>Content</Label>
                <div className="mt-1">
                  <RichTextEditor
                    content={{ ...emailContent, hideHeader: true, hideEditorHeader: true }}
                    onContentChange={c => setEmailContent({ content: c.content })}
                    inline
                  />
                </div>
              </div>
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setEditingEmail(null)}>Cancel</Button>
                <Button onClick={saveEmailNode} disabled={savingNode || !emailSubject.trim()}>
                  {savingNode ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delay Editor Modal */}
        <Dialog open={editingDelay !== null} onOpenChange={(open) => { if (!open) { setEditingDelay(null); setPendingNodeType(null) } }}>
          <DialogContent className="w-[540px] max-w-[95vw] p-10" style={{ width: '540px', maxWidth: '95vw' }}>
            <DialogHeader className="mb-6">
              <DialogTitle>Time Delay</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <Label>Wait for</Label>
                <Select value={delayType} onValueChange={setDelayType}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount_of_time">A certain amount of time</SelectItem>
                    <SelectItem value="day_of_week">A certain day of the week</SelectItem>
                    <SelectItem value="time_of_day">A certain time of day</SelectItem>
                    <SelectItem value="specific_date">A specific day of the year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {delayType === 'amount_of_time' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" min="1" value={delayValue} onChange={e => setDelayValue(e.target.value)} />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Select value={delayUnit} onValueChange={setDelayUnit}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {delayType === 'day_of_week' && (
                <div>
                  <Label>Day</Label>
                  <Select value={delayDay} onValueChange={setDelayDay}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {delayType === 'time_of_day' && (
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={delayTime} onChange={e => setDelayTime(e.target.value)} />
                </div>
              )}

              {delayType === 'specific_date' && (
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={delayDate} onChange={e => setDelayDate(e.target.value)} />
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setEditingDelay(null)}>Cancel</Button>
                <Button onClick={saveDelayNode} disabled={savingNode}>
                  {savingNode ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </>
  )
}
