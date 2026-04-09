/**
 * Re-exports from the centralized integrations module.
 * Kept for backward compatibility — all existing importers continue to work.
 */

export type { SiteIntegration } from '@/lib/actions/integrations/integration-actions'

export {
  getSiteIntegration,
  getSiteIntegrations,
  createOrUpdateIntegration,
  toggleIntegration,
} from '@/lib/actions/integrations/integration-actions'

export {
  getResendConfig,
  getEmailConfig,
} from '@/lib/actions/integrations/config-helpers'
