"use client"

import { useCallback, useEffect, useState, use } from "react"
import { useRouter } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog } from "@/components/ui/dialog"
import { DashboardModalContent, DashboardModalFooterActions, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor
} from "@/components/ui/combobox"
import { CreateAutomationEmailModal } from "@/components/admin/newsletter-builder/automation/CreateAutomationEmailModal"
import type { CreateAutomationEmailInput } from "@/components/admin/newsletter-builder/automation/CreateAutomationEmailModal"
import { AutomationEmailSettingsModal } from "@/components/admin/newsletter-builder/automation/AutomationEmailSettingsModal"
import { NewsletterStatusEventsModal } from "@/components/admin/newsletter-builder/layout/NewsletterStatusEventsModal"
import {
  getAutomationById,
  updateAutomation,
  createStep,
  updateStep,
  deleteStep,
  reorderSteps,
  getAutomationJourneyIndicators,
  getAutomationReport
} from "@/lib/actions/newsletters/automation-actions"
import type {
  EmailAutomation,
  AutomationJourneyIndicator,
  AutomationStep
} from "@/lib/actions/newsletters/automation-actions"
import { getSiteProductsAction } from "@/lib/actions/products/product-actions"
import type { Product } from "@/lib/actions/products/product-actions"
import { getSegmentsWithCounts } from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import {
  getTriggerSegmentIds,
  getAutomationTriggerNodes,
  isAutomationTriggerConfigured,
  serializeAutomationTriggerNodes,
  type AutomationTriggerNode,
  type AutomationTriggerType
} from "@/lib/actions/newsletters/automation-triggers"
import {
  DEFAULT_NEWSLETTER_SEND_WINDOW_TIMEZONE,
  getNewsletterSendWindows,
  isWithinNewsletterSendWindow
} from "@/lib/actions/newsletters/send-windows"
import { cn } from "@/lib/utils/tailwind"
import BarChart3 from "lucide-react/dist/esm/icons/chart-column.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Clock from "lucide-react/dist/esm/icons/clock.js"
import Mail from "lucide-react/dist/esm/icons/mail.js"
import PencilLine from "lucide-react/dist/esm/icons/pencil-line.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Zap from "lucide-react/dist/esm/icons/zap.js"
import { showErrorToast } from "@/lib/error-toast"

interface PageProps {
  params: Promise<{ automationId: string }>
}

const EMPTY_TRIGGER_NODE: AutomationTriggerNode = { type: "none", config: {} }
type EmailStepStats = { sent: number; duplicateSends: number; opened: number; clicked: number }
type CheckpointAction = "continue" | "end"

function getCheckpointAction(config: AutomationStep["node_config"] | undefined): CheckpointAction | "" {
  if (config?.checkpoint_action === "continue" || config?.checkpoint_action === "end") {
    return config.checkpoint_action
  }
  return ""
}

function getCheckpointActionLabel(action: CheckpointAction | "") {
  if (action === "end") return "End automation"
  if (action === "continue") return "Continue"
  return "Select action"
}

export default function AutomationBuilderPage({ params }: PageProps) {
  const { automationId } = use(params)
  const router = useRouter()

  const [automation, setAutomation] = useState<EmailAutomation | null>(null)
  const [nodes, setNodes] = useState<AutomationStep[]>([])
  const [journeyIndicators, setJourneyIndicators] = useState<Record<number, AutomationJourneyIndicator>>({})
  const [emailStepStats, setEmailStepStats] = useState<Record<number, EmailStepStats>>({})
  const [emailStepStatsLoaded, setEmailStepStatsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [segments, setSegments] = useState<Segment[]>([])
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({})
  const [loadingSegments, setLoadingSegments] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [triggerNodes, setTriggerNodes] = useState<AutomationTriggerNode[]>([])
  const [selectedTriggerIndex, setSelectedTriggerIndex] = useState(0)
  const [triggerEditorOpen, setTriggerEditorOpen] = useState(false)
  const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | null>(null)
  const [draftTriggerType, setDraftTriggerType] = useState<AutomationTriggerType>("none")
  const [draftSegmentIds, setDraftSegmentIds] = useState<string[]>([])
  const [draftProductId, setDraftProductId] = useState("")
  const [savingTrigger, setSavingTrigger] = useState(false)
  const [addAfterIndex, setAddAfterIndex] = useState<number | null>(null)
  const [editingDelay, setEditingDelay] = useState<AutomationStep | null>(null)
  const [delayType, setDelayType] = useState("amount_of_time")
  const [delayValue, setDelayValue] = useState("1")
  const [delayUnit, setDelayUnit] = useState("days")
  const [delayDay, setDelayDay] = useState("1")
  const [delayDate, setDelayDate] = useState("")
  const [editingEndRules, setEditingEndRules] = useState<AutomationStep | null>(null)
  const [checkpointAction, setCheckpointAction] = useState<CheckpointAction | "">("")
  const [savingNode, setSavingNode] = useState(false)
  const [pendingInsertIndex, setPendingInsertIndex] = useState(0)
  const [emailCreateOpen, setEmailCreateOpen] = useState(false)
  const [emailCreateKey, setEmailCreateKey] = useState(0)
  const [editingEmailSettings, setEditingEmailSettings] = useState<AutomationStep | null>(null)
  const [statusEventsStep, setStatusEventsStep] = useState<AutomationStep | null>(null)
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(null)
  const [deleteNodeError, setDeleteNodeError] = useState<string | null>(null)
  const [pendingDeleteTriggerIndex, setPendingDeleteTriggerIndex] = useState<number | null>(null)
  const siteId = automation?.site_id ?? null
  const segmentTriggerAnchor = useComboboxAnchor()

  const loadJourneyIndicators = useCallback(async () => {
    const { data } = await getAutomationJourneyIndicators({ data: { automationId: automationId } })
    if (!data) return
    setJourneyIndicators(data)
  }, [automationId])

  const loadEmailStepStats = useCallback(async () => {
    const { data } = await getAutomationReport({ data: { automationId: automationId } })
    if (!data) {
      setEmailStepStatsLoaded(true)
      return
    }
    setEmailStepStats(
      Object.fromEntries(
        data.stepStats.map((step) => [
          step.step_order,
          {
            sent: step.sent,
            duplicateSends: step.duplicate_sends,
            opened: step.opened,
            clicked: step.clicked,
          },
        ])
      )
    )
    setEmailStepStatsLoaded(true)
  }, [automationId])

  useEffect(() => {
    let cancelled = false

    async function loadAutomation() {
      setLoading(true)
      setEmailStepStatsLoaded(false)
      setEmailStepStats({})
      setJourneyIndicators({})
      const { data, steps, error } = await getAutomationById({ data: { automationId: automationId } })

      if (cancelled) return

      if (error || !data) {
        setError(error || "Not found")
        setLoading(false)
        return
      }

      setAutomation(data)
      setTriggerNodes(getAutomationTriggerNodes(data.trigger_type, data.trigger_config))
      setSelectedTriggerIndex(0)
      setNodes(steps || [])
      setLoading(false)
    }

    loadAutomation()

    return () => {
      cancelled = true
    }
  }, [automationId])

  useEffect(() => {
    void loadJourneyIndicators()
    void loadEmailStepStats()
    const interval = window.setInterval(() => {
      void loadJourneyIndicators()
      void loadEmailStepStats()
    }, 30000)
    return () => window.clearInterval(interval)
  }, [loadJourneyIndicators, loadEmailStepStats])

  useEffect(() => {
    if (!siteId) {
      setSegments([])
      setSegmentCounts({})
      setLoadingSegments(false)
      return
    }

    const currentSiteId = siteId
    let cancelled = false

    async function loadSegments() {
      setLoadingSegments(true)
      const { data, counts } = await getSegmentsWithCounts({ data: { siteId: currentSiteId, options: {
        page: 1,
        pageSize: 100
      } } })
      if (cancelled) return
      setSegments(data || [])
      setSegmentCounts(counts || {})
      setLoadingSegments(false)
    }

    loadSegments()

    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    if (!siteId) {
      setProducts([])
      setLoadingProducts(false)
      return
    }

    const currentSiteId = siteId
    let cancelled = false

    async function loadProducts() {
      setLoadingProducts(true)
      const { data } = await getSiteProductsAction({ data: { siteId: currentSiteId, options: {
        page: 1,
        pageSize: 100
      } } })
      if (cancelled) return
      setProducts(data || [])
      setLoadingProducts(false)
    }

    loadProducts()

    return () => {
      cancelled = true
    }
  }, [siteId])

  const configuredTriggerNodes = triggerNodes.filter((node) => isAutomationTriggerConfigured(node.type, node.config))
  const triggerConfigured = configuredTriggerNodes.length > 0
  const displayedTriggerNodes: AutomationTriggerNode[] = triggerNodes.length ? triggerNodes : [EMPTY_TRIGGER_NODE]
  const purchaseProducts = products.filter((product) => Boolean(product.content_blocks?.["product-checkout"]))
  const productTriggerOptions = purchaseProducts
  const productTriggerLabel = "Product"
  const segmentTriggerItems = segments.map((segment) => ({
    value: segment.id,
    label: segment.name
  }))
  const centerAxisStyle = { transform: "translateX(1.5px)" }

  const flash = (message: string) => {
    setSaveStatus("saved", message)
  }

  const handleStatusToggle = async () => {
    if (!automation) return

    setSaving(true)
    const newStatus = automation.status === "active" ? "paused" : "active"
    const { data, error } = await updateAutomation({ data: { automationId: automation.id, updates: {
      status: newStatus
    } } })

    if (error) setError(error)
    if (data) setAutomation(data)
    if (data?.status === "active") void loadJourneyIndicators()

    setSaving(false)
  }

  const handleAddNode = async (nodeType: "email" | "delay" | "end_rules", afterIndex: number) => {
    setAddAfterIndex(null)
    setPendingInsertIndex(afterIndex)

    if (nodeType === "email") {
      setEmailCreateKey((key) => key + 1)
      setEmailCreateOpen(true)
      return
    }

    if (nodeType === "end_rules") {
      setEditingEndRules({ id: "__new__" } as AutomationStep)
      setCheckpointAction("")
      return
    }

    setEditingDelay({ id: "__new__" } as AutomationStep)
    setDelayType("amount_of_time")
    setDelayValue("1")
    setDelayUnit("days")
    setDelayDay("1")
    setDelayDate("")
  }

  const createAndInsertNode = async (nodeType: "email" | "delay" | "end_rules", nodeData: Partial<AutomationStep>) => {
    if (!automation) return null

    const tempOrder = 99999 + Math.floor(Math.random() * 1000)
    const { data, error: createError } = await createStep({ data: { input: {
      automationId: automation.id,
      stepOrder: tempOrder,
      nodeType,
      subject: nodeData.subject || undefined,
      content: nodeData.content || undefined,
      nodeConfig: nodeData.node_config || {},
      delayMinutes: nodeData.delay_minutes || 0,
      contentBlocks: nodeData.content_blocks || {}
    } } })

    if (createError || !data) {
      setError(createError || "Failed to create node")
      return null
    }

    const sorted = [...nodes].sort((a, b) => a.step_order - b.step_order)
    const newOrder = [...sorted.slice(0, pendingInsertIndex), data, ...sorted.slice(pendingInsertIndex)]
    const nextNodes = newOrder.map((node, index) => ({
      ...node,
      step_order: index + 1
    }))
    setNodes(nextNodes)
    await reorderSteps({ data: { automationId: automation.id, stepIds: nextNodes.map((node) => node.id) } })
    void loadJourneyIndicators()

    return nextNodes[pendingInsertIndex] || data
  }

  const createEmailNode = async (input: CreateAutomationEmailInput, openEditor: boolean) => {
    const data = await createAndInsertNode("email", {
      subject: input.subject,
      node_config: input.node_config,
      content_blocks: input.content_blocks
    })

    if (!data) return false

    setEmailCreateOpen(false)
    if (openEditor) {
      router.push(`/admin/newsletters/automations/${automationId}/email/${data.id}`)
    } else {
      flash("Saved")
    }
    return true
  }

  const openDelayEditor = (node: AutomationStep) => {
    setEditingDelay(node)
    const config = node.node_config || {}
    setDelayType(config.delay_type || "amount_of_time")
    setDelayValue(String(config.delay_value || 1))
    setDelayUnit(config.delay_unit || "days")
    setDelayDay(String(config.day ?? 1))
    setDelayDate(config.date || "")
  }

  const saveDelayNode = async () => {
    if (!editingDelay) return

    setSavingNode(true)

    const config: Record<string, any> = { delay_type: delayType }
    let minutes = 0

    if (delayType === "amount_of_time") {
      const value = parseInt(delayValue) || 1
      config.delay_value = value
      config.delay_unit = delayUnit
      minutes = delayUnit === "days" ? value * 1440 : delayUnit === "hours" ? value * 60 : value
    } else if (delayType === "day_of_week") {
      config.day = parseInt(delayDay)
      minutes = 1440
    } else if (delayType === "specific_date") {
      config.date = delayDate
      minutes = 1440
    }

    if (editingDelay.id === "__new__") {
      const data = await createAndInsertNode("delay", {
        node_config: config,
        delay_minutes: minutes
      })
      if (data) flash("Added")
    } else {
      const { data, error } = await updateStep({ data: { stepId: editingDelay.id, updates: {
        node_config: config,
        delay_minutes: minutes
      } } })

      if (error) setError(error)
      if (data) {
        setNodes((prev) => prev.map((node) => (node.id === data.id ? data : node)))
        void loadJourneyIndicators()
        flash("Saved")
      }
    }

    setEditingDelay(null)
    setSavingNode(false)
  }

  const openEndRulesEditor = (node: AutomationStep) => {
    setEditingEndRules(node)
    setCheckpointAction(getCheckpointAction(node.node_config))
  }

  const saveEndRulesNode = async () => {
    if (!editingEndRules || !checkpointAction) return

    setSavingNode(true)
    const node_config = {
      checkpoint_action: checkpointAction
    }

    if (editingEndRules.id === "__new__") {
      const data = await createAndInsertNode("end_rules", { node_config })
      if (data) flash("Added")
    } else {
      const { data, error } = await updateStep({ data: { stepId: editingEndRules.id, updates: {
        node_config
      } } })
      if (error) setError(error)
      if (data) {
        setNodes((prev) => prev.map((node) => (node.id === data.id ? data : node)))
        flash("Saved")
      }
    }

    setEditingEndRules(null)
    setSavingNode(false)
  }

  const handleDeleteNode = async (nodeId: string) => {
    const { success, error: deleteError } = await deleteStep({ data: { stepId: nodeId } })
    if (!success) {
      setDeleteNodeError(deleteError || "Failed to delete node")
      return false
    }

    setNodes((prev) => prev.filter((node) => node.id !== nodeId))
    void loadJourneyIndicators()
    if (editingDelay?.id === nodeId) setEditingDelay(null)
    if (editingEndRules?.id === nodeId) setEditingEndRules(null)
    return true
  }

  const confirmDeleteNode = async () => {
    if (!pendingDeleteNodeId) return
    const nodeId = pendingDeleteNodeId
    if (await handleDeleteNode(nodeId)) setPendingDeleteNodeId(null)
  }

  const openTriggerEditor = (index: number) => {
    const triggerNode = displayedTriggerNodes[index] ?? EMPTY_TRIGGER_NODE
    setSelectedTriggerIndex(index)
    setEditingTriggerIndex(index)
    setDraftTriggerType(triggerNode.type)
    setDraftSegmentIds(getTriggerSegmentIds(triggerNode.config))
    setDraftProductId(typeof triggerNode.config?.product_id === "string" ? triggerNode.config.product_id : "")
    setTriggerEditorOpen(true)
  }

  const buildTriggerConfig = (triggerType: AutomationTriggerType) => {
    if (triggerType === "segment_added") {
      return { segment_ids: draftSegmentIds }
    }

    if (triggerType === "lead_magnet_signup" || triggerType === "paid_purchase") {
      return { product_id: draftProductId }
    }

    return {}
  }

  const persistTriggerNodes = async (nextTriggerNodes: AutomationTriggerNode[]) => {
    if (!automation) return null

    const serializedTriggers = serializeAutomationTriggerNodes(nextTriggerNodes)
    const { data, error } = await updateAutomation({ data: { automationId: automation.id, updates: {
      ...(serializedTriggers.triggerType === "none" && automation.status === "active" ? { status: "draft" } : {}),
      trigger_type: serializedTriggers.triggerType,
      trigger_config: serializedTriggers.triggerConfig
    } } })

    if (error) {
      setError(error)
      return null
    }

    if (!data) return null

    const nextPersistedNodes = getAutomationTriggerNodes(data.trigger_type, data.trigger_config)
    setAutomation(data)
    setTriggerNodes(nextPersistedNodes)
    if (data.status === "active") void loadJourneyIndicators()
    return nextPersistedNodes
  }

  const saveTrigger = async () => {
    if (draftTriggerType === "segment_added" && !draftSegmentIds.length) {
      setError("Choose at least one segment before saving this trigger.")
      return
    }
    if (draftTriggerType === "paid_purchase" && !draftProductId) {
      setError("Choose a product before saving this trigger.")
      return
    }

    setSavingTrigger(true)

    const nextTriggerNodes = [...triggerNodes]
    const nextTriggerNode: AutomationTriggerNode = {
      type: draftTriggerType,
      config: buildTriggerConfig(draftTriggerType)
    }

    if (draftTriggerType === "none") {
      if (editingTriggerIndex !== null && editingTriggerIndex < nextTriggerNodes.length) {
        nextTriggerNodes.splice(editingTriggerIndex, 1)
      }
    } else if (editingTriggerIndex !== null && editingTriggerIndex < nextTriggerNodes.length) {
      nextTriggerNodes[editingTriggerIndex] = nextTriggerNode
    } else {
      nextTriggerNodes.push(nextTriggerNode)
    }

    const persistedTriggerNodes = await persistTriggerNodes(nextTriggerNodes)
    if (persistedTriggerNodes) {
      setSelectedTriggerIndex(
        persistedTriggerNodes.length
          ? Math.min(editingTriggerIndex ?? persistedTriggerNodes.length - 1, persistedTriggerNodes.length - 1)
          : 0
      )
      setEditingTriggerIndex(null)
      setTriggerEditorOpen(false)
      flash("Trigger saved")
    }

    setSavingTrigger(false)
  }

  const removeTrigger = () => {
    if (editingTriggerIndex === null || editingTriggerIndex >= triggerNodes.length) return
    setPendingDeleteTriggerIndex(editingTriggerIndex)
  }

  const removeTriggerAtIndex = async (index: number) => {
    if (index < 0 || index >= triggerNodes.length) return

    setSavingTrigger(true)
    const nextTriggerNodes = [...triggerNodes]
    nextTriggerNodes.splice(index, 1)

    const persistedTriggerNodes = await persistTriggerNodes(nextTriggerNodes)
    if (persistedTriggerNodes) {
      setSelectedTriggerIndex(persistedTriggerNodes.length ? Math.min(index, persistedTriggerNodes.length - 1) : 0)
      setEditingTriggerIndex(null)
      setTriggerEditorOpen(false)
      flash("Trigger removed")
      setPendingDeleteTriggerIndex(null)
    }

    setSavingTrigger(false)
  }

  const formatDelay = (node: AutomationStep) => {
    const config = node.node_config || {}
    const type = config.delay_type || "amount_of_time"

    if (type === "amount_of_time") {
      return `Wait ${config.delay_value || 0} ${config.delay_unit || "minutes"}`
    }

    if (type === "day_of_week") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      return `Wait until ${days[config.day as number] || "Monday"}`
    }

    if (type === "specific_date") return `Wait until ${config.date || "date"}`
    return "Wait"
  }

  const formatNextTriggerTime = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return `Next trigger: ${date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })}`
  }

  const formatNextDripDate = (date: Date) => `Next drip: ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })}`

  const getNextCronTime = (from = new Date()) => {
    const next = new Date(from)
    next.setSeconds(0, 0)
    const remainder = next.getMinutes() % 5
    next.setMinutes(next.getMinutes() + (remainder === 0 ? 5 : 5 - remainder))
    return next
  }

  const getCurrentTimezoneMinutes = (timezone: string, now: Date) => {
    try {
      const localizedNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }))
      return localizedNow.getHours() * 60 + localizedNow.getMinutes()
    } catch {
      return now.getHours() * 60 + now.getMinutes()
    }
  }

  const getNextDripLabel = (dripConfig: Record<string, any>) => {
    const nextBatch = formatNextTriggerTime(dripConfig.next_batch_at)?.replace("Next trigger", "Next drip")
    if (nextBatch) return nextBatch

    const now = new Date()
    if (isWithinNewsletterSendWindow(dripConfig, now)) return formatNextDripDate(getNextCronTime(now))

    const windows = getNewsletterSendWindows(dripConfig)
    const nextWindowStart = windows
      .map(window => window.start)
      .sort()
      .find(start => {
        const [hours, minutes] = start.split(":").map(Number)
        const timezone = typeof dripConfig.send_window_timezone === "string"
          ? dripConfig.send_window_timezone
          : DEFAULT_NEWSLETTER_SEND_WINDOW_TIMEZONE
        return hours * 60 + minutes > getCurrentTimezoneMinutes(timezone, now)
      }) || windows[0]?.start

    if (!nextWindowStart) return formatNextDripDate(getNextCronTime(now))

    const [hours, minutes] = nextWindowStart.split(":").map(Number)
    const nextWindowDate = new Date(now)
    if (hours * 60 + minutes <= getCurrentTimezoneMinutes(
      typeof dripConfig.send_window_timezone === "string"
        ? dripConfig.send_window_timezone
        : DEFAULT_NEWSLETTER_SEND_WINDOW_TIMEZONE,
      now
    )) {
      nextWindowDate.setDate(nextWindowDate.getDate() + 1)
    }
    nextWindowDate.setHours(hours, minutes, 0, 0)
    return formatNextDripDate(nextWindowDate)
  }

  const delayChipClass =
    "h-6 whitespace-nowrap rounded-full border-yellow-200 bg-yellow-50 px-2 text-xs font-normal text-yellow-800 hover:bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
  const emailChipClass =
    "h-6 shrink-0 rounded-full border-blue-200 bg-blue-50 px-2 text-xs font-normal text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/40"

  const getEmailStatusLabel = (node: AutomationStep) => {
    if (!node.subject?.trim()) return "Needs subject"
    if (automation?.status === "active") {
      const dripConfig = node.node_config?.drip_config
      if (dripConfig?.enabled === true) {
        if (dripConfig.next_batch_at) return getNextDripLabel(dripConfig)
        if (!nodes.some(candidate => candidate.step_order < node.step_order)) return getNextDripLabel(dripConfig)
        return (emailStepStats[node.step_order]?.sent ?? 0) > 0 ? "Drip sending" : "Waiting for trigger"
      }
      if ((emailStepStats[node.step_order]?.sent ?? 0) <= 0) return "Waiting for contact"
      return "Sending"
    }
    if (automation?.status === "paused") return "Paused"
    return "Draft"
  }

  const currentDelayStepId = nodes.find((node, index) => {
    const nextNode = nodes[index + 1]
    return (
      emailStepStatsLoaded &&
      node.node_type === "delay" &&
      !!journeyIndicators[node.step_order] &&
      nextNode?.node_type === "email" &&
      getEmailStatusLabel(nextNode) === "Waiting for trigger"
    )
  })?.id

  const getTriggerDetails = (triggerNode: AutomationTriggerNode) => {
    if (triggerNode.type === "segment_added") {
      return {
        title: "Added to segment",
        description: "Starts when a contact is newly added to a segment."
      }
    }

    if (triggerNode.type === "lead_magnet_signup") {
      return {
        title: "Lead magnet signup",
        description: "Starts when someone signs up for a lead magnet."
      }
    }

    if (triggerNode.type === "paid_purchase") {
      return {
        title: "Paid purchase",
        description: "Starts when someone completes a purchase."
      }
    }

    return {
      title: "Choose trigger",
      description: "Select how contacts should enter this automation."
    }
  }

  const getTriggerChip = (triggerNode: AutomationTriggerNode) => {
    if (triggerNode.type === "segment_added") {
      const segmentIds = getTriggerSegmentIds(triggerNode.config)
      const segmentNames = segmentIds
        .map((id) => segments.find((segment) => segment.id === id)?.name)
        .filter(Boolean)
      const segmentTotal = segmentIds.reduce((sum, id) => sum + (segmentCounts[id] ?? 0), 0)
      const segmentLabel =
        segmentNames.length === 0
          ? "Choose segment"
          : segmentNames.length === 1
            ? segmentNames[0]
            : `${segmentNames.length} segments`

      return {
        label: `${segmentLabel} - ${segmentTotal.toLocaleString()} contacts`,
        className: "border-border bg-muted text-muted-foreground hover:bg-muted"
      }
    }

    if (triggerNode.type === "lead_magnet_signup") {
      const productId = typeof triggerNode.config?.product_id === "string" ? triggerNode.config.product_id : ""
      const productName = products.find((product) => product.id === productId)?.title

      return {
        label: productName || "Choose lead magnet",
        className: "border-border bg-muted text-muted-foreground hover:bg-muted"
      }
    }

    if (triggerNode.type === "paid_purchase") {
      const productId = typeof triggerNode.config?.product_id === "string" ? triggerNode.config.product_id : ""
      const productName = purchaseProducts.find((product) => product.id === productId)?.title

      return {
        label: productName || "Choose product",
        className: "border-border bg-muted text-muted-foreground hover:bg-muted"
      }
    }

    return null
  }

  const AddNodeButton = ({ afterIndex }: { afterIndex: number }) => (
    <div className="my-6 flex justify-center">
      {addAfterIndex === afterIndex ? (
        <div className="flex flex-wrap justify-center gap-2" style={centerAxisStyle}>
          <Button size="sm" variant="outline" onClick={() => handleAddNode("delay", afterIndex)}>
            <Clock className="mr-1 h-3 w-3" /> Time Delay
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleAddNode("email", afterIndex)}>
            <Mail className="mr-1 h-3 w-3" /> Email
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleAddNode("end_rules", afterIndex)}>
            <CheckCircle2 className="mr-1 h-3 w-3" /> Checkpoint
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddAfterIndex(null)}>
            ✕
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddAfterIndex(afterIndex)}
          style={centerAxisStyle}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )

  const AddTriggerButton = () => (
    <div className="my-6 flex justify-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => openTriggerEditor(triggerNodes.length)}
        style={centerAxisStyle}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add Trigger
      </Button>
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <DashboardStickyHeader
          rightActions={
            <StickybarTopRightActions
              rightActions={
                <>
                  <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
                  <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                </>
              }
            />
          }
        />
        <AdminLayout>
          <div className="mx-auto w-full max-w-2xl px-6 py-8">
            <div className="relative mx-auto w-full pb-6">
              <div className="pointer-events-none absolute inset-0 flex justify-center">
                <div className="h-full w-px bg-border" style={centerAxisStyle} />
              </div>

              <div className="relative z-10">
                {[1, 2].map((index) => (
                  <div key={index} className="w-full">
                    <Card className="w-full">
                      <CardContent>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                            <div className="min-w-0 flex-1">
                              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted/70" />
                              <div className="mt-3 h-6 w-24 animate-pulse rounded-md bg-muted/70" />
                            </div>
                          </div>
                          <div className="h-8 w-8 animate-pulse rounded bg-muted/70" />
                        </div>
                      </CardContent>
                    </Card>
                    {index === 1 && (
                      <div className="my-6 flex justify-center">
                        <div className="h-9 w-28 animate-pulse rounded-md bg-muted" style={centerAxisStyle} />
                      </div>
                    )}
                  </div>
                ))}

                <div className="my-6 flex justify-center">
                  <div
                    className="h-6 w-6 animate-pulse rounded-full bg-muted"
                    style={centerAxisStyle}
                  />
                </div>

                {[1, 2, 3].map((index) => (
                  <div key={index} className="w-full">
                    <Card className="w-full">
                      <CardContent>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="h-[52px] w-[52px] animate-pulse rounded-lg bg-muted" />
                            <div className="min-w-0 flex-1">
                              <div className="h-4 w-44 animate-pulse rounded bg-muted" />
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <div className="h-6 w-16 animate-pulse rounded bg-muted/70" />
                                <div className="h-6 w-14 animate-pulse rounded bg-muted/70" />
                                <div className="h-6 w-20 animate-pulse rounded bg-muted/70" />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="h-8 w-8 animate-pulse rounded bg-muted/70" />
                            <div className="h-8 w-8 animate-pulse rounded bg-muted/70" />
                            <div className="h-8 w-8 animate-pulse rounded bg-muted/70" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <div className="my-6 flex justify-center">
                      <div
                        className="h-6 w-6 animate-pulse rounded-full bg-muted"
                        style={centerAxisStyle}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AdminLayout>
      </div>
    )
  }

  if (!automation) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <DashboardStickyHeader />
        <AdminLayout>
          <div className="w-full p-8 text-center">
            <p className="mb-4 text-red-600">{error}</p>
            <Button onClick={() => router.push("/admin/newsletters/automations")} variant="outline">
              Back
            </Button>
          </div>
        </AdminLayout>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <DashboardStickyHeader
        rightActions={
          <StickybarTopRightActions
            saveStatus={saveStatus}
            rightActions={
              <>
                <Badge
                  variant={automation.status === "active" ? "default" : "secondary"}
                  className={automation.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300" : ""}
                >
                  {automation.status === "active" ? "Active" : automation.status === "paused" ? "Paused" : "Draft"}
                </Badge>
                <Button
                  size="sm"
                  variant={automation.status === "active" ? "destructive" : "default"}
                  onClick={handleStatusToggle}
                  disabled={
                    saving ||
                    (automation.status !== "active" &&
                      (!triggerConfigured || nodes.filter((node) => node.node_type === "email").length === 0))
                  }
                >
                  {automation.status === "active" ? "Pause" : "Activate"}
                </Button>
              </>
            }
          />
        }
      />
      <AdminLayout>
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="relative mx-auto w-full pb-6">
            <div className="pointer-events-none absolute inset-0 flex justify-center">
              <div className="h-full w-px bg-border" style={centerAxisStyle} />
            </div>

            <div className="relative z-10">
              {displayedTriggerNodes.map((triggerNode, index) => {
                const isSelected = selectedTriggerIndex === index
                const triggerDetails = getTriggerDetails(triggerNode)
                const triggerChip = getTriggerChip(triggerNode)
                const isPlaceholder = triggerNode.type === "none"

                return (
                  <div key={`${triggerNode.type}-${index}`} className="w-full">
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => openTriggerEditor(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          openTriggerEditor(index)
                        }
                      }}
                      className={cn(
                        "w-full cursor-pointer p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isSelected && !isPlaceholder ? "ring-1 ring-blue-500/15" : "",
                        isSelected && isPlaceholder ? "ring-1 ring-border" : ""
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-lg",
                                  isPlaceholder ? "bg-muted" : "bg-zinc-100"
                                )}
                              >
                                <Zap
                                  className={cn("h-4 w-4", isPlaceholder ? "text-muted-foreground" : "text-zinc-950")}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">Trigger</TooltipContent>
                          </Tooltip>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{triggerDetails.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{triggerDetails.description}</p>
                            {triggerChip && (
                              <Badge
                                className={cn(
                                  "mt-3 rounded-md px-2.5 py-1 text-xs font-medium shadow-none",
                                  triggerChip.className
                                )}
                              >
                                {triggerChip.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {!isPlaceholder && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Remove trigger"
                            disabled={savingTrigger}
                            className="h-8 w-8 shrink-0 p-0 text-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingDeleteTriggerIndex(index)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  </div>
                )
              })}

              {triggerNodes.length > 0 && <AddTriggerButton />}
              <AddNodeButton afterIndex={0} />

              {nodes.map((node, index) => (
                <div key={node.id} className="w-full">
                  {node.node_type === "delay" ? (
                    <Card
                      className="relative w-full cursor-pointer border-l-4 border-l-yellow-400 p-4 transition-colors hover:border-primary/50 hover:bg-muted"
                      style={node.id === currentDelayStepId ? {
                        borderColor: "#22c55e",
                        borderLeftColor: "#22c55e",
                        boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.2)",
                      } : undefined}
                      onClick={() => openDelayEditor(node)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-yellow-50">
                                <Clock className="h-5 w-5 text-yellow-600" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">Time Delay</TooltipContent>
                          </Tooltip>
                          <div>
                            <p className="text-sm font-medium">{formatDelay(node)}</p>
                            {(formatNextTriggerTime(journeyIndicators[node.step_order]?.next_due_at) ||
                              journeyIndicators[node.step_order]) && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {formatNextTriggerTime(journeyIndicators[node.step_order]?.next_due_at) && (
                                  <Badge variant="outline" className={delayChipClass}>
                                    {formatNextTriggerTime(journeyIndicators[node.step_order]?.next_due_at)}
                                  </Badge>
                                )}
                                {journeyIndicators[node.step_order] && (
                                  <Badge variant="outline" className={delayChipClass}>
                                    {journeyIndicators[node.step_order].label}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPendingDeleteNodeId(node.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ) : node.node_type === "end_rules" ? (
                    <Card
                      className="w-full cursor-pointer border-l-4 border-l-green-500 p-4 transition-colors hover:border-primary/50 hover:bg-muted"
                      onClick={() => openEndRulesEditor(node)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-green-50">
                                <CheckCircle2 className="h-5 w-5 text-green-700" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">Checkpoint</TooltipContent>
                          </Tooltip>
                          <div>
                            <p className="text-sm font-medium">Checkpoint</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge
                                variant="outline"
                                className="h-auto min-h-6 max-w-full shrink justify-start whitespace-normal border-green-200 bg-green-50 px-2 text-left text-xs font-normal text-green-800 hover:bg-green-50 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-900/40"
                              >
                                {getCheckpointActionLabel(getCheckpointAction(node.node_config))}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPendingDeleteNodeId(node.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <Card
                      className="w-full cursor-pointer border-l-4 border-l-blue-400 p-4 transition-colors hover:border-primary/50 hover:bg-muted"
                      onClick={() => setEditingEmailSettings(node)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-blue-50">
                                <Mail className="h-5 w-5 text-blue-600" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">Send Email</TooltipContent>
                          </Tooltip>
                          <div>
                            <p className="text-sm font-medium">{node.subject || "No subject"}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className={emailChipClass}>
                                {getEmailStatusLabel(node)}
                              </Badge>
                              {(emailStepStats[node.step_order]?.sent ?? 0) > 0 &&
                                [
                                  ["sent", emailStepStats[node.step_order]?.sent ?? 0],
                                  ["duplicates", emailStepStats[node.step_order]?.duplicateSends ?? 0],
                                  ["opened", emailStepStats[node.step_order]?.opened ?? 0],
                                  ["clicked", emailStepStats[node.step_order]?.clicked ?? 0]
                                ].filter(([, count]) => Number(count) > 0).map(([label, count]) => (
                                  <Badge key={label} variant="outline" className={emailChipClass}>
                                    {Number(count).toLocaleString()} {label}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="View email events"
                            className="h-8 w-8 p-0"
                            onClick={(event) => {
                              event.stopPropagation()
                              setStatusEventsStep(node)
                            }}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit email"
                            className="h-8 w-8 p-0"
                            onClick={(event) => {
                              event.stopPropagation()
                              router.push(`/admin/newsletters/automations/${automationId}/email/${node.id}`)
                            }}
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete email"
                            className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingDeleteNodeId(node.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}

                  <AddNodeButton afterIndex={index + 1} />
                </div>
              ))}

              {nodes.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Add your first node to start building the sequence.
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog open={emailCreateOpen} onOpenChange={setEmailCreateOpen}>
          <CreateAutomationEmailModal
            key={emailCreateKey}
            siteId={siteId || ""}
            onCreate={createEmailNode}
          />
        </Dialog>

        <AutomationEmailSettingsModal
          open={editingEmailSettings !== null}
          onOpenChange={(open) => {
            if (!open) setEditingEmailSettings(null)
          }}
          step={editingEmailSettings}
          siteId={siteId || ""}
          onSuccess={(step) => {
            setNodes((prev) => prev.map((node) => (node.id === step.id ? step : node)))
            flash("Saved")
          }}
        />

        <NewsletterStatusEventsModal
          open={statusEventsStep !== null}
          automationId={automationId}
          stepOrder={statusEventsStep?.step_order ?? null}
          showRateCards
          onError={showErrorToast}
          onOpenChange={(open) => {
            if (!open) setStatusEventsStep(null)
          }}
        />

        <ConfirmDestructive
          action="delete-automation-node"
          open={pendingDeleteNodeId !== null}
          title="Delete Node"
          description="Are you sure you want to delete this node? This action cannot be undone."
          error={deleteNodeError}
          onCancel={() => { setPendingDeleteNodeId(null); setDeleteNodeError(null) }}
          onConfirm={confirmDeleteNode}
        />
        <ConfirmDestructive
          action="delete-automation-trigger"
          open={pendingDeleteTriggerIndex !== null}
          title="Remove trigger?"
          error={error}
          disabled={savingTrigger}
          onCancel={() => setPendingDeleteTriggerIndex(null)}
          onConfirm={() => pendingDeleteTriggerIndex !== null
            ? removeTriggerAtIndex(pendingDeleteTriggerIndex)
            : undefined}
        />

        <Dialog
          open={triggerEditorOpen}
          onOpenChange={(open) => {
            setTriggerEditorOpen(open)
            if (!open) {
              setEditingTriggerIndex(null)
              if (selectedTriggerIndex >= displayedTriggerNodes.length) {
                setSelectedTriggerIndex(displayedTriggerNodes.length ? displayedTriggerNodes.length - 1 : 0)
              }
            }
          }}
        >
          <DashboardModalContent
            title="Trigger"
            description="Choose what event enrolls a contact into this automation."
            footer={
              <DashboardModalFooterActions>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTriggerEditorOpen(false)
                    setEditingTriggerIndex(null)
                    if (selectedTriggerIndex >= displayedTriggerNodes.length) {
                      setSelectedTriggerIndex(displayedTriggerNodes.length ? displayedTriggerNodes.length - 1 : 0)
                    }
                  }}
                >
                  Cancel
                </Button>
                {editingTriggerIndex !== null && editingTriggerIndex < triggerNodes.length && (
                  <Button variant="outline" onClick={removeTrigger} disabled={savingTrigger}>
                    Remove
                  </Button>
                )}
                <Button
                  onClick={saveTrigger}
                  disabled={
                    savingTrigger ||
                    (draftTriggerType === "segment_added" && (!draftSegmentIds.length || segments.length === 0)) ||
                    (draftTriggerType === "paid_purchase" && (!draftProductId || productTriggerOptions.length === 0))
                  }
                >
                  {savingTrigger ? "Saving..." : "Save"}
                </Button>
              </DashboardModalFooterActions>
            }
          >
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Trigger</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel>When should this automation start?</FieldLabel>
                    <Select
                      value={draftTriggerType}
                      onValueChange={(value) => {
                        const nextTriggerType = value as AutomationTriggerType
                        setDraftTriggerType(nextTriggerType)
                        if (nextTriggerType !== "segment_added") setDraftSegmentIds([])
                        if (nextTriggerType !== "paid_purchase") {
                          setDraftProductId("")
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="segment_added">Added to segment</SelectItem>
                        <SelectItem value="paid_purchase">Paid purchase</SelectItem>
                        <SelectItem value="none">Remove trigger</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {draftTriggerType === "segment_added" && (
                    <div className="space-y-2">
                      <Field>
                        <FieldLabel>Segments</FieldLabel>
                        <Combobox
                          items={segmentTriggerItems}
                          value={draftSegmentIds}
                          onValueChange={setDraftSegmentIds}
                          multiple
                        >
                          <ComboboxChips ref={segmentTriggerAnchor} className="w-full">
                            <ComboboxValue>
                              {(values) => (
                                <>
                                  {values.map((segmentId) => {
                                    const segmentName =
                                      segments.find((segment) => segment.id === segmentId)?.name || "Missing segment"
                                    return (
                                      <ComboboxChip key={segmentId} value={segmentId}>
                                        {segmentName}
                                      </ComboboxChip>
                                    )
                                  })}
                                  <ComboboxChipsInput
                                    placeholder={
                                      values.length
                                        ? ""
                                        : loadingSegments
                                          ? "Loading segments..."
                                          : "Search segments"
                                    }
                                  />
                                </>
                              )}
                            </ComboboxValue>
                          </ComboboxChips>
                          <ComboboxContent anchor={segmentTriggerAnchor}>
                            <ComboboxEmpty>{loadingSegments ? "Loading segments..." : "No segments found."}</ComboboxEmpty>
                            <ComboboxList>
                              {(item) => {
                                const value = typeof item === "string" ? item : item.value
                                const label = typeof item === "string" ? item : item.label

                                return (
                                  <ComboboxItem key={value} value={value}>
                                    <span className="flex-1">{label}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {(segmentCounts[value] ?? 0).toLocaleString()}
                                    </span>
                                  </ComboboxItem>
                                )
                              }}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                      </Field>
                      {!loadingSegments && segments.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Create a segment first, then come back here to use a segment trigger.
                        </p>
                      )}
                    </div>
                  )}

                  {draftTriggerType === "paid_purchase" && (
                    <div className="space-y-2">
                      <Field>
                        <FieldLabel>{productTriggerLabel}</FieldLabel>
                        <Select value={draftProductId} onValueChange={setDraftProductId}>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={
                                loadingProducts ? "Loading products..." : `Choose a ${productTriggerLabel.toLowerCase()}`
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {productTriggerOptions.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {!loadingProducts && productTriggerOptions.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Create a product with a checkout block first, then come back here to use a paid purchase trigger.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </Dialog>

        <Dialog
          open={editingEndRules !== null}
          onOpenChange={(open) => {
            if (!open) setEditingEndRules(null)
          }}
        >
          <DashboardModalContent
            title="Checkpoint"
            description="Choose what happens when a contact reaches this point."
            footer={
              <>
                <Button variant="outline" onClick={() => setEditingEndRules(null)}>
                  Cancel
                </Button>
                <Button onClick={saveEndRulesNode} disabled={savingNode || !checkpointAction}>
                  {savingNode ? "Saving..." : "Save"}
                </Button>
              </>
            }
          >
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Checkpoint</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel>Action</FieldLabel>
                    <Select value={checkpointAction} onValueChange={(value) => setCheckpointAction(value as CheckpointAction)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="continue">Continue</SelectItem>
                        <SelectItem value="end">End automation</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </Dialog>

        <Dialog
          open={editingDelay !== null}
          onOpenChange={(open) => {
            if (!open) setEditingDelay(null)
          }}
        >
          <DashboardModalContent
            title="Time Delay"
            description="Set how long the automation should wait before the next step runs."
            footer={
              <>
                <Button variant="outline" onClick={() => setEditingDelay(null)}>
                  Cancel
                </Button>
                <Button onClick={saveDelayNode} disabled={savingNode}>
                  {savingNode ? "Saving..." : "Save"}
                </Button>
              </>
            }
          >
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Time delay</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel>Wait for</FieldLabel>
                    <Select value={delayType} onValueChange={setDelayType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount_of_time">A certain amount of time</SelectItem>
                        <SelectItem value="day_of_week">A certain day of the week</SelectItem>
                        <SelectItem value="specific_date">A specific day of the year</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {delayType === "amount_of_time" && (
                    <div className="grid grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel>Amount</FieldLabel>
                        <Input
                          type="number"
                          min="1"
                          value={delayValue}
                          onChange={(event) => setDelayValue(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Unit</FieldLabel>
                        <Select value={delayUnit} onValueChange={setDelayUnit}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  )}

                  {delayType === "day_of_week" && (
                    <Field>
                      <FieldLabel>Day</FieldLabel>
                      <Select value={delayDay} onValueChange={setDelayDay}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
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
                    </Field>
                  )}

                  {delayType === "specific_date" && (
                    <Field>
                      <FieldLabel>Date</FieldLabel>
                      <Input type="date" value={delayDate} onChange={(event) => setDelayDate(event.target.value)} />
                    </Field>
                  )}
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </Dialog>
      </AdminLayout>
    </div>
  )
}
