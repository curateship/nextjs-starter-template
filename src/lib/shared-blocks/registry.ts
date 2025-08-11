import { BlockDefinition, BlockInstance } from './types'
import { heroRuixenBlockDefinition } from './definitions/hero-ruixen-block'
import { richTextBlockDefinition } from './definitions/rich-text-block'

class BlockRegistry {
  private blocks: Map<string, BlockDefinition> = new Map()

  constructor() {
    this.registerBlock(heroRuixenBlockDefinition)
    this.registerBlock(richTextBlockDefinition)
  }

  registerBlock(definition: BlockDefinition): void {
    this.blocks.set(definition.type, definition)
  }

  getBlock(type: string): BlockDefinition | undefined {
    return this.blocks.get(type)
  }

  getAllBlocks(): BlockDefinition[] {
    return Array.from(this.blocks.values())
  }

  getBlocksByCategory(category?: string): BlockDefinition[] {
    return this.getAllBlocks()
  }

  createBlockInstance(type: string, overrides?: Partial<Record<string, any>>): BlockInstance | null {
    const definition = this.getBlock(type)
    if (!definition) {
      return null
    }

    return {
      id: `${type}-${Date.now()}`,
      type: definition.type,
      title: definition.defaultContent.title || definition.name,
      content: {
        ...definition.defaultContent,
        ...overrides
      }
    }
  }

  validateBlockContent(type: string, content: Record<string, any>): { valid: boolean; errors: string[] } {
    const definition = this.getBlock(type)
    if (!definition) {
      return { valid: false, errors: ['Unknown block type'] }
    }

    const errors: string[] = []
    const { schema } = definition

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!content[field] || content[field] === '') {
          errors.push(`${schema.properties[field]?.label || field} is required`)
        }
      }
    }

    // Validate field types and constraints
    for (const [key, property] of Object.entries(schema.properties)) {
      const value = content[key]
      
      if (value !== undefined && value !== null) {
        // Type validation
        if (property.type === 'string' || property.type === 'textarea' || property.type === 'richtext' || property.type === 'url') {
          if (typeof value !== 'string') {
            errors.push(`${property.label} must be a string`)
            continue
          }

          // Length validation
          if (property.validation?.minLength && value.length < property.validation.minLength) {
            errors.push(`${property.label} must be at least ${property.validation.minLength} characters`)
          }
          if (property.validation?.maxLength && value.length > property.validation.maxLength) {
            errors.push(`${property.label} must be no more than ${property.validation.maxLength} characters`)
          }

          // URL validation
          if (property.type === 'url' && value) {
            try {
              new URL(value)
            } catch {
              errors.push(`${property.label} must be a valid URL`)
            }
          }

          // Pattern validation
          if (property.validation?.pattern && !new RegExp(property.validation.pattern).test(value)) {
            errors.push(`${property.label} format is invalid`)
          }
        }

        if (property.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`${property.label} must be true or false`)
        }

        if (property.type === 'number' && typeof value !== 'number') {
          errors.push(`${property.label} must be a number`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}

// Singleton instance
export const blockRegistry = new BlockRegistry()

// claude.md followed