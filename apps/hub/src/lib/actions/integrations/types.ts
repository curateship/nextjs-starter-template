export type IntegrationType =
  | 'flodesk'
  | 'resend'
  | 'stripe'
  | 'anthropic'
  | 'openai'
  | 'perplexity'
  | 'google_ai'

/**
 * Map of config keys that contain sensitive values per integration type.
 * These fields will be encrypted before writing to the database.
 */
export const SENSITIVE_FIELDS: Record<IntegrationType, string[]> = {
  flodesk: ['api_key'],
  resend: ['api_key', 'webhook_secret'],
  stripe: ['secret_key', 'webhook_secret'],
  anthropic: ['api_key'],
  openai: ['api_key'],
  perplexity: ['api_key'],
  google_ai: ['api_key'],
}

export interface IntegrationFieldDefinition {
  key: string
  label: string
  type: 'text' | 'password' | 'email'
  placeholder?: string
  required?: boolean
}

export type IntegrationCategory = 'payments' | 'email' | 'ai' | 'seo'

export interface IntegrationRegistryEntry {
  type: IntegrationType
  label: string
  description: string
  category: IntegrationCategory
  fields: IntegrationFieldDefinition[]
}

export const INTEGRATION_REGISTRY: IntegrationRegistryEntry[] = [
  // Payments
  {
    type: 'stripe',
    label: 'Stripe',
    description: 'Payment processing for products and subscriptions',
    category: 'payments',
    fields: [
      { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sk_...', required: true },
      { key: 'publishable_key', label: 'Publishable Key', type: 'text', placeholder: 'pk_...', required: true },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' },
    ],
  },
  // Email
  {
    type: 'resend',
    label: 'Resend',
    description: 'Transactional email delivery',
    category: 'email',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 're_...', required: true },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' },
      { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'noreply@yourdomain.com' },
      { key: 'from_name', label: 'From Name', type: 'text', placeholder: 'Your Company' },
    ],
  },
  {
    type: 'flodesk',
    label: 'Flodesk',
    description: 'Email marketing and subscriber management',
    category: 'email',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'fk_...', required: true },
      { key: 'segment_id', label: 'Default Segment ID', type: 'text', placeholder: 'seg_...' },
    ],
  },
  // AI Providers
  {
    type: 'anthropic',
    label: 'Anthropic',
    description: 'Claude AI models',
    category: 'ai',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-ant-...', required: true },
    ],
  },
  {
    type: 'openai',
    label: 'OpenAI',
    description: 'GPT and DALL-E models',
    category: 'ai',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
  },
  {
    type: 'perplexity',
    label: 'Perplexity',
    description: 'Perplexity AI search and generation',
    category: 'ai',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'pplx-...', required: true },
    ],
  },
  {
    type: 'google_ai',
    label: 'Google AI',
    description: 'Gemini models',
    category: 'ai',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
]
