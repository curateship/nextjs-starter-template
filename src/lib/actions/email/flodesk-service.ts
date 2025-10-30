/**
 * Flodesk API configuration
 */
interface FlodeskConfig {
  apiKey: string
  segmentId: string
}

/**
 * Parameters for adding a subscriber to Flodesk
 */
interface AddSubscriberParams {
  email: string
  segmentId: string
  tags?: string[]
  firstName?: string
  lastName?: string
  customFields?: Record<string, string>
}

/**
 * Flodesk API response
 */
interface FlodeskResult {
  success: boolean
  subscriberId?: string
  error?: string
}

/**
 * Flodesk subscriber data structure
 */
interface FlodeskSubscriber {
  id: string
  email: string
  first_name?: string
  last_name?: string
  custom_fields?: Record<string, string>
}

/**
 * Flodesk API service for managing email subscribers
 *
 * API Documentation: https://developers.flodesk.com
 */
class FlodeskService {
  private readonly baseUrl = 'https://api.flodesk.com/v1'

  /**
   * Add or update a subscriber in Flodesk
   * Flodesk automatically handles duplicates - if email exists, it updates the subscriber
   */
  async addSubscriber(
    config: FlodeskConfig,
    params: AddSubscriberParams
  ): Promise<FlodeskResult> {
    try {
      const { apiKey, segmentId } = config
      const { email, tags, firstName, lastName, customFields } = params

      // Validate configuration
      if (!apiKey || !segmentId) {
        return {
          success: false,
          error: 'Flodesk API key and segment ID are required',
        }
      }

      // Validate email
      if (!email || !this.isValidEmail(email)) {
        return {
          success: false,
          error: 'Valid email address is required',
        }
      }

      // Build subscriber payload
      const payload: Record<string, any> = {
        email: email.toLowerCase().trim(),
      }

      if (firstName) payload.first_name = firstName
      if (lastName) payload.last_name = lastName
      if (customFields) payload.custom_fields = customFields

      // Add subscriber to Flodesk
      const subscriberResponse = await fetch(`${this.baseUrl}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      })

      if (!subscriberResponse.ok) {
        const errorData = await subscriberResponse.json().catch(() => ({}))
        console.error('Flodesk API error (add subscriber):', errorData)

        // Flodesk returns 409 if subscriber already exists - this is OK
        if (subscriberResponse.status === 409) {
          // Get existing subscriber ID from error response
          const subscriberId = errorData?.id || 'existing-subscriber'
          console.log('Subscriber already exists in Flodesk:', email)

          // Continue to add to segment and tags (will update existing subscriber)
        } else {
          return {
            success: false,
            error: `Flodesk API error: ${subscriberResponse.status} ${subscriberResponse.statusText}`,
          }
        }
      }

      const subscriberData = subscriberResponse.ok
        ? ((await subscriberResponse.json()) as FlodeskSubscriber)
        : null

      const subscriberId = subscriberData?.id

      // Add subscriber to segment
      if (segmentId) {
        await this.addToSegment(apiKey, subscriberId || email, segmentId)
      }

      // Add tags if provided
      if (tags && tags.length > 0) {
        await this.addTags(apiKey, subscriberId || email, tags)
      }

      return {
        success: true,
        subscriberId: subscriberId,
      }
    } catch (error) {
      console.error('Error adding subscriber to Flodesk:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Add subscriber to a segment
   */
  private async addToSegment(
    apiKey: string,
    subscriberIdOrEmail: string,
    segmentId: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/segments/${segmentId}/subscribers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            subscriber_id: subscriberIdOrEmail,
          }),
        }
      )

      if (!response.ok && response.status !== 409) {
        // 409 means already in segment, which is fine
        console.error(
          `Failed to add subscriber to segment: ${response.status}`
        )
      }
    } catch (error) {
      console.error('Error adding subscriber to Flodesk segment:', error)
      // Don't throw - we don't want to fail the entire operation if segment add fails
    }
  }

  /**
   * Add tags to a subscriber
   */
  private async addTags(
    apiKey: string,
    subscriberIdOrEmail: string,
    tags: string[]
  ): Promise<void> {
    try {
      for (const tag of tags) {
        const response = await fetch(
          `${this.baseUrl}/subscribers/${subscriberIdOrEmail}/tags`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              name: tag,
            }),
          }
        )

        if (!response.ok && response.status !== 409) {
          // 409 means tag already exists, which is fine
          console.error(`Failed to add tag "${tag}": ${response.status}`)
        }
      }
    } catch (error) {
      console.error('Error adding tags to Flodesk subscriber:', error)
      // Don't throw - we don't want to fail the entire operation if tag add fails
    }
  }

  /**
   * Test Flodesk API connection
   */
  async testConnection(apiKey: string): Promise<FlodeskResult> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribers`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        return {
          success: false,
          error: `Invalid API key or connection failed: ${response.status}`,
        }
      }

      return {
        success: true,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Generate tag name from product slug
   * Example: "seo-guide" -> "lead-magnet-seo-guide"
   */
  generateLeadMagnetTag(productSlug: string): string {
    return `lead-magnet-${productSlug}`
  }
}

// Export singleton instance
export const flodeskService = new FlodeskService()

// Export types
export type {
  FlodeskConfig,
  AddSubscriberParams,
  FlodeskResult,
  FlodeskSubscriber,
}
