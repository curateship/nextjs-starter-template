# Sidebar Estimated AI Spend

  ## Summary

  - Add site-scoped estimated AI spend tracking for OpenAI, Anthropic, and Google AI.
  - Show a compact Est. AI Spend block in the sidebar footer above the user dropdown. Because the sidebar is global, it will appear on all admin pages and always reflect
    the currently selected site.
  - Use current-month totals only. Start counting from feature launch; no backfill and no provider invoice sync.

  ## Key Changes

  - Add a small pricing utility with one alias map from repo model ids and provider response model ids to billing tiers, then compute cost in integer USD micros to avoid
  - Update generateAIContent internals so each provider helper returns content, resolved model, and usage tokens:
  - OpenAI: usage.prompt_tokens + usage.completion_tokens
  - Anthropic: usage.input_tokens + usage.output_tokens
  - Google AI: usageMetadata.promptTokenCount + usageMetadata.candidatesTokenCount
  - After each successful AI response, insert one usage row for that site. Metering is non-blocking: if usage data or price mapping is missing, log the issue and skip the
    spend row rather than failing content generation.
  - Add getAISpendSummary(siteId) server action that verifies site ownership, sums estimated_cost_micros from the first day of the current month through now, and returns
    summary data for the sidebar.
  - Add a small client sidebar component that reads currentSite, fetches the summary on mount and site change, renders a loading skeleton, shows $0.00 when no rows exist,
    hides when no site is selected, and hides in collapsed-sidebar mode.
  - Do not add a dashboard card or sticky-header badge in v1.

  ## Interfaces

  - New DB entity: ai_usage_events
  - New server action: getAISpendSummary(siteId): Promise<{ data: { totalMicros: number; totalUsd: number; monthStart: string } | null; error: string | null }>
  - New internal AI provider result shape: content, model, inputTokens, outputTokens, totalTokens

  ## Test Plan

  - Generate AI content once with each supported provider and confirm one usage row is written with the expected token fields and a non-zero estimated cost.
  - Verify the sidebar footer shows the selected site’s current-month total, updates after site switching, and stays separate per site.
  - Verify zero-usage, no-site, loading, and collapsed-sidebar states render cleanly.
  - Verify an unknown or unpriced model does not break generation and does not inflate the total.
  - Run npm --workspace @repo/hub run lint.

  ## Assumptions

  - Spend is estimated only, not provider-billed spend.
  - Scope is AI only; other integrations and Perplexity are out of scope for v1.
  - Current month uses the app’s existing server-side date handling; no historical import.
  - Pricing constants should be sourced from the providers’ current pricing pages at implementation time, and repo model ids should be normalized through an alias map
    because some ids in the repo are UI aliases or preview names. That aliasing is an inference from the repo model list versus the provider pricing pages.
  - Usage-field references: OpenAI Chat Completions (https://platform.openai.com/docs/api-reference/chat/create-chat-completion), Anthropic Messages examples
    (https://docs.anthropic.com/en/api/messages-examples), Gemini generateContent / UsageMetadata (https://ai.google.dev/api/rest/generativelanguage)
  - Pricing references: OpenAI (https://platform.openai.com/pricing), Anthropic (https://docs.anthropic.com/en/docs/about-claude/pricing), Google
    (https://ai.google.dev/pricing)