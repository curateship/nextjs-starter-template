export const AUTOMATION_TRIGGER_TYPES = [
  'none',
  'segment_added',
  'lead_magnet_signup',
  'paid_purchase',
] as const

export type AutomationTriggerType = typeof AUTOMATION_TRIGGER_TYPES[number]

export interface AutomationTriggerNode {
  type: AutomationTriggerType
  config: Record<string, any>
}

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  none: 'Choose Trigger',
  segment_added: 'Added to Segment',
  lead_magnet_signup: 'Lead Magnet Signup',
  paid_purchase: 'Paid Purchase',
}

export const AUTOMATION_TRIGGER_SHORT_LABELS: Record<AutomationTriggerType, string> = {
  none: 'Choose Trigger',
  segment_added: 'Segment Added',
  lead_magnet_signup: 'Lead Magnet',
  paid_purchase: 'Purchase',
}

export function isAutomationTriggerType(value: string): value is AutomationTriggerType {
  return AUTOMATION_TRIGGER_TYPES.includes(value as AutomationTriggerType)
}

function cleanTriggerConfig(config: Record<string, any> | null | undefined) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  const { additional_triggers, ...rest } = config
  return rest
}

export function isAutomationTriggerConfigured(
  triggerType: AutomationTriggerType,
  triggerConfig: Record<string, any> | null | undefined
) {
  if (triggerType === 'none') return false
  if (triggerType === 'segment_added') {
    return typeof triggerConfig?.segment_id === 'string' && triggerConfig.segment_id.length > 0
  }
  if (triggerType === 'lead_magnet_signup' || triggerType === 'paid_purchase') {
    return typeof triggerConfig?.product_id === 'string' && triggerConfig.product_id.length > 0
  }
  return true
}

export function getAutomationTriggerNodes(
  triggerType: string,
  triggerConfig: Record<string, any> | null | undefined
): AutomationTriggerNode[] {
  if (!isAutomationTriggerType(triggerType) || triggerType === 'none') return []

  const primaryNode: AutomationTriggerNode = {
    type: triggerType,
    config: cleanTriggerConfig(triggerConfig),
  }

  const additionalTriggers = Array.isArray(triggerConfig?.additional_triggers)
    ? triggerConfig.additional_triggers
    : []

  const additionalNodes = additionalTriggers
    .map((entry): AutomationTriggerNode | null => {
      if (!entry || typeof entry !== 'object') return null
      const type = typeof entry.type === 'string' ? entry.type : ''
      if (!isAutomationTriggerType(type) || type === 'none') return null
      return {
        type,
        config: cleanTriggerConfig(entry.config),
      }
    })
    .filter((node): node is AutomationTriggerNode => node !== null)

  return [primaryNode, ...additionalNodes]
}

export function serializeAutomationTriggerNodes(triggerNodes: AutomationTriggerNode[]) {
  const nextNodes = triggerNodes
    .filter(node => isAutomationTriggerType(node.type) && node.type !== 'none')
    .map(node => ({
      type: node.type,
      config: cleanTriggerConfig(node.config),
    }))

  if (!nextNodes.length) {
    return {
      triggerType: 'none' as AutomationTriggerType,
      triggerConfig: {},
    }
  }

  const [primaryNode, ...additionalNodes] = nextNodes
  const triggerConfig: Record<string, any> = { ...primaryNode.config }

  if (additionalNodes.length) {
    triggerConfig.additional_triggers = additionalNodes.map(node => ({
      type: node.type,
      config: node.config,
    }))
  }

  return {
    triggerType: primaryNode.type,
    triggerConfig,
  }
}

export function matchesAutomationTrigger(
  triggerNode: AutomationTriggerNode,
  triggerType: AutomationTriggerType,
  filterId?: string
) {
  if (triggerNode.type !== triggerType) return false
  if (!filterId) return false

  if (triggerType === 'segment_added') {
    const segmentId = triggerNode.config?.segment_id
    return segmentId === filterId
  }

  const productId = triggerNode.config?.product_id
  return productId === filterId
}
