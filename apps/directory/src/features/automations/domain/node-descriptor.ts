import type {
  AutomationEdge,
  AutomationNode,
  AutomationNodeKind,
  AutomationSourcePort,
} from './types'

export type NodeGroup = 'Triggers' | 'Sources' | 'AI' | 'Actions'

export type NodeOf<K extends AutomationNodeKind> = Extract<AutomationNode, { kind: K }>
export type ConfigOf<K extends AutomationNodeKind> = NodeOf<K>['config']

export interface NodeCommon {
  id: string
  name: string
  x: number
  y: number
}

export interface NodeOutputPort {
  id: AutomationSourcePort
  label: string
}

export type PushError = (code: string, message: string) => void

export interface GraphNodeContext {
  incoming: AutomationEdge[]
  outgoing: AutomationEdge[]
}

// References to site resources a node depends on, aggregated across a graph so
// the editor can check them all in one batch of queries.
export interface ResourceRefs {
  postTemplateIds?: string[]
  listingTemplateIds?: string[]
  categoryIds?: string[]
}

export interface ResolvedResources {
  postTemplates: Set<string>
  listingTemplates: Set<string>
  categories: Set<string>
}

/**
 * Everything the app needs to know about one automation node kind, in one place.
 * Adding a node kind means writing one of these (plus its type, UI panel, and
 * executor) instead of editing the catalog, parser, validator, and canvas.
 */
export interface NodeDomainDescriptor<K extends AutomationNodeKind = AutomationNodeKind> {
  kind: K
  meta: { name: string; description: string; group: NodeGroup }
  // Palette default node name, when it differs from the display name (e.g. Agent).
  defaultName?: string
  // Incoming-connection arity used by graph validation.
  inputs: 'none' | 'single' | 'multi'
  // Terminal action nodes (Post, Listing) create content and take no outputs.
  terminal?: boolean
  // Whether a configured AI provider is required to save/activate ('required')
  // or merely used best-effort at run time ('optional').
  providerRequirement?: 'required' | 'optional'

  createConfig(): ConfigOf<K>
  ports(node: NodeOf<K>): NodeOutputPort[]
  // Parse and bound untrusted stored config. Throws on invalid data.
  parseConfig(config: Record<string, unknown>, common: NodeCommon): ConfigOf<K>
  // Per-node config validation (missing fields, duplicates, ...).
  validate(node: NodeOf<K>, push: PushError): void
  // Target node kinds this node may connect to from the given output port.
  allowedTargets(port: AutomationSourcePort): AutomationNodeKind[]
  // Extra edge-shape validation beyond the generic input/output arity checks.
  validateConnections?(node: NodeOf<K>, ctx: GraphNodeContext, push: PushError): void
  // Site resources this node references, for the editor's availability checks.
  resourceRefs?(node: NodeOf<K>): ResourceRefs
  validateResources?(node: NodeOf<K>, resolved: ResolvedResources, push: PushError): void
}

/**
 * A descriptor with its per-kind generic erased, so descriptors of different
 * kinds live in one collection. Its methods take the base node union; a concrete
 * `NodeDomainDescriptor<K>` assigns to it because method parameters are bivariant.
 * Consumers dispatch by kind, so passing a matching node is always safe.
 */
export interface AnyNodeDescriptor {
  kind: AutomationNodeKind
  meta: { name: string; description: string; group: NodeGroup }
  defaultName?: string
  inputs: 'none' | 'single' | 'multi'
  terminal?: boolean
  providerRequirement?: 'required' | 'optional'
  createConfig(): AutomationNode['config']
  ports(node: AutomationNode): NodeOutputPort[]
  parseConfig(config: Record<string, unknown>, common: NodeCommon): AutomationNode['config']
  validate(node: AutomationNode, push: PushError): void
  allowedTargets(port: AutomationSourcePort): AutomationNodeKind[]
  validateConnections?(node: AutomationNode, ctx: GraphNodeContext, push: PushError): void
  resourceRefs?(node: AutomationNode): ResourceRefs
  validateResources?(node: AutomationNode, resolved: ResolvedResources, push: PushError): void
}

/** Identity helper so a descriptor literal infers its kind `K`. */
export function defineNode<K extends AutomationNodeKind>(descriptor: NodeDomainDescriptor<K>): NodeDomainDescriptor<K> {
  return descriptor
}
