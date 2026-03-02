export interface DataForSEOResponse<T> {
  version: string
  status_code: number
  status_message: string
  time: string
  cost: number
  tasks_count: number
  tasks_error: number
  tasks: DataForSEOTask<T>[]
}

export interface DataForSEOTask<T> {
  id: string
  status_code: number
  status_message: string
  time: string
  cost: number
  result_count: number
  path: string[]
  data: Record<string, unknown>
  result: T[] | null
}

export interface KeywordSuggestionResult {
  seed_keyword: string
  seed_keyword_data: KeywordSuggestionItem | null
  items_count: number
  items: KeywordSuggestionItem[]
}

export interface KeywordSuggestionItem {
  se_type: string
  keyword: string
  location_code: number
  language_code: string
  keyword_info: {
    se_type: string
    last_updated_time: string
    competition: number
    competition_level: string
    cpc: number
    search_volume: number
    low_top_of_page_bid: number
    high_top_of_page_bid: number
    categories: number[] | null
    monthly_searches: {
      year: number
      month: number
      search_volume: number
    }[]
  }
  keyword_properties: {
    se_type: string
    core_keyword: string | null
    synonym_clustering_algorithm: string
    keyword_difficulty: number
    detected_language: string
    is_another_language: boolean
  }
  search_intent_info: {
    se_type: string
    main_intent: string
    foreign_intent: string[]
    last_updated_time: string
  }
  impressions_info: {
    se_type: string
    last_updated_time: string
    bid: number
    match_type: string
    ad_position_min: number | null
    ad_position_max: number | null
    ad_position_average: number | null
    cpc_min: number | null
    cpc_max: number | null
    daily_impressions_min: number | null
    daily_impressions_max: number | null
    daily_clicks_min: number | null
    daily_clicks_max: number | null
    daily_cost_min: number | null
    daily_cost_max: number | null
  } | null
}
