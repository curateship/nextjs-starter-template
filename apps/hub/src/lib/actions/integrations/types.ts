export type IntegrationType =
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
  resend: ['api_key', 'webhook_secret'],
  stripe: ['secret_key', 'webhook_secret', 'sandbox_secret_key', 'sandbox_webhook_secret'],
  anthropic: ['api_key'],
  openai: ['api_key'],
  perplexity: ['api_key'],
  google_ai: ['api_key'],
}

export interface IntegrationFieldDefinition {
  key: string
  label: string
  type: 'text' | 'password' | 'email' | 'select'
  placeholder?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
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
      {
        key: 'mode',
        label: 'Active Stripe Credentials',
        type: 'select',
        required: true,
        options: [
          { value: 'live', label: 'Use live keys' },
          { value: 'sandbox', label: 'Use sandbox keys' },
        ],
      },
      { key: 'secret_key', label: 'Live Secret Key', type: 'password', placeholder: 'sk_live_...' },
      { key: 'publishable_key', label: 'Live Publishable Key', type: 'text', placeholder: 'pk_live_...' },
      { key: 'webhook_secret', label: 'Live Webhook Secret', type: 'password' },
      { key: 'sandbox_secret_key', label: 'Sandbox Secret Key', type: 'password', placeholder: 'sk_test_...' },
      { key: 'sandbox_publishable_key', label: 'Sandbox Publishable Key', type: 'text', placeholder: 'pk_test_...' },
      { key: 'sandbox_webhook_secret', label: 'Sandbox Webhook Secret', type: 'password' },
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
