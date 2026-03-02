import { DataForSEOClient } from './client'
import type { DataForSEOResponse, KeywordSuggestionResult, KeywordSuggestionItem } from './types'

interface KeywordSuggestionOptions {
  locationCode?: number
  languageCode?: string
  limit?: number
}

export async function getKeywordSuggestions(
  seedKeyword: string,
  options?: KeywordSuggestionOptions
): Promise<KeywordSuggestionItem[]> {
  const client = new DataForSEOClient()

  const locationCode = options?.locationCode ?? 2840 // US
  const languageCode = options?.languageCode ?? 'en'
  const limit = options?.limit ?? 50

  const response = await client.post<DataForSEOResponse<KeywordSuggestionResult>>(
    '/v3/dataforseo_labs/google/keyword_suggestions/live',
    [{
      keyword: seedKeyword,
      location_code: locationCode,
      language_code: languageCode,
      limit,
      order_by: ['keyword_info.search_volume,desc'],
    }]
  )

  if (response.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${response.status_message}`)
  }

  const task = response.tasks?.[0]
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || 'No task returned'}`)
  }

  const result = task.result?.[0]
  if (!result) {
    return []
  }

  return result.items || []
}
