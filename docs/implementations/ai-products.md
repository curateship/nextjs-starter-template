# AI Content Generation Implementation Plan

## Overview
Implement AI-powered content generation for products, pages, posts, and directory items. Users can describe their content via a prompt, and AI will generate all necessary blocks automatically. Includes a hybrid approach with both quick generation and chat-based refinement.

---

## Project Goals
- ✨ Generate complete product pages from simple prompts
- 💬 Enable iterative refinement through AI chat
- 🎨 Build reusable UI components for all content types (products, pages, posts, directory)
- 💰 Keep costs low (~$0.002 per generation using GPT-4o-mini)
- 📊 Track usage and implement rate limiting
- 🔒 Ensure content sanitization and security

---

## Architecture Decisions

### UI Approach
- **Modal-based interface** (can be expanded to slide-over later if needed)
- **Hybrid generation mode**: Quick generate OR chat-based
- **Large modal** (~max-w-4xl) to accommodate content preview and chat

### AI Provider
- **Vercel AI SDK** for provider abstraction
- **Primary model**: GPT-4o-mini (cost-effective, ~$0.002/generation)
- **Upgrade option**: GPT-4o for higher quality (~$0.03/generation)
- **Future**: Support for Anthropic Claude, other providers

### Data Flow
1. User enters prompt + selects blocks (auto or manual)
2. AI generates content for each block type
3. Preview results in modal
4. Option to refine via chat
5. Apply to product/page/post/directory

---

## Phase 1: Foundation & Dependencies

### 1.1 Install Dependencies
- [ ] Install `ai` package (Vercel AI SDK)
- [ ] Install `@ai-sdk/openai` for OpenAI integration
- [ ] Add OpenAI API key to environment variables
- [ ] Create `.env.example` entry for `OPENAI_API_KEY`

### 1.2 Create Type Definitions
**File**: `src/types/ai-generation.ts`

- [ ] Define `AIGenerationConfig` interface
- [ ] Define `GeneratedBlock` interface
- [ ] Define `BlockTypeConfig` interface
- [ ] Define `ContentType` union type (product | page | post | directory)
- [ ] Define `AIGenerationMode` type (idle | quick-generate | chat | generating | preview)
- [ ] Define `AIMessage` interface for chat messages
- [ ] Define `AIModelConfig` interface (model name, cost per 1k tokens)

### 1.3 Block Type Configuration
**File**: `src/lib/config/ai-block-configs.ts`

- [ ] Define available blocks for products
  - product-hero
  - product-features
  - product-hotspot
  - product-pricing
  - faq
  - product-video
  - rich-text
- [ ] Define available blocks for pages (future)
- [ ] Define available blocks for posts (future)
- [ ] Define available blocks for directory (future)
- [ ] Export block metadata (label, description, icon)

---

## Phase 2: AI Service Layer

### 2.1 Create AI Prompt Templates
**File**: `src/lib/ai/prompt-templates.ts`

- [ ] Create system prompt for content generation
- [ ] Create block-specific prompts for:
  - [ ] Hero section (title, subtitle, CTA buttons)
  - [ ] Features block (feature list with descriptions)
  - [ ] FAQ block (questions and answers)
  - [ ] Pricing block (tiers, features, pricing)
  - [ ] Video block (title, subtitle, video context)
  - [ ] Rich text block (general content)
- [ ] Create prompt for auto-selecting which blocks to generate
- [ ] Create chat system prompt for iterative refinement

### 2.2 AI Generation Service
**File**: `src/lib/ai/generation-service.ts`

- [ ] Create `generateBlocks()` function
  - Takes: user prompt, selected block types, model choice
  - Returns: array of `GeneratedBlock`
- [ ] Create `generateSingleBlock()` helper
  - Generates content for one specific block type
- [ ] Create `autoSelectBlocks()` function
  - AI decides which blocks are needed based on prompt
- [ ] Implement token counting for cost estimation
- [ ] Add error handling and retry logic
- [ ] Add streaming support for real-time generation (optional)

### 2.3 AI Chat Service
**File**: `src/lib/ai/chat-service.ts`

- [ ] Create `ChatSession` class to manage conversation state
- [ ] Implement `sendMessage()` method
- [ ] Implement `refineBlock()` method for targeted refinements
- [ ] Maintain conversation context (previous messages)
- [ ] Support streaming responses
- [ ] Track token usage per session

### 2.4 Content Sanitization
**File**: `src/lib/ai/content-sanitizer.ts`

- [ ] Create sanitization function for AI-generated content
- [ ] Remove script tags, javascript:, event handlers
- [ ] Validate URLs in generated content
- [ ] Ensure generated content matches block schemas
- [ ] Add validation for required fields per block type

---

## Phase 3: Server Actions

### 3.1 AI Generation Actions
**File**: `src/lib/actions/ai/generation-actions.ts`

- [ ] Create `generateContentBlocksAction()`
  - Input: prompt, block types, model, content type
  - Output: generated blocks array
  - Add user authentication check
  - Add rate limiting check
  - Log generation request for analytics
- [ ] Create `estimateGenerationCostAction()`
  - Calculate estimated tokens and cost
  - Return cost estimate to user
- [ ] Add error handling and user-friendly messages

### 3.2 AI Chat Actions
**File**: `src/lib/actions/ai/chat-actions.ts`

- [ ] Create `sendChatMessageAction()`
  - Input: session ID, message, current blocks
  - Output: AI response + updated blocks
- [ ] Create `createChatSessionAction()`
  - Initialize new chat session
  - Store in database or session storage
- [ ] Create `refineSingleBlockAction()`
  - Refine specific block based on feedback

### 3.3 Usage Tracking
**File**: `src/lib/actions/ai/usage-actions.ts`

- [ ] Create database table `ai_usage_logs`
  - Fields: user_id, site_id, content_type, model, tokens_used, cost, timestamp
- [ ] Create `logAIUsageAction()`
  - Log each generation request
- [ ] Create `getUserAIUsageAction()`
  - Get user's usage stats (daily/monthly)
- [ ] Implement rate limiting logic
  - Max 50 generations per day per user (configurable)
  - Max 10 chat sessions per hour

---

## Phase 4: UI Components

### 4.1 Main Dialog Component
**File**: `src/components/admin/ai-generation/AIGenerationDialog.tsx`

- [ ] Create modal wrapper using `Dialog` from shadcn/ui
- [ ] Manage modal state (open/close)
- [ ] Switch between different modes (idle, generating, preview, chat)
- [ ] Handle modal size (max-w-4xl, responsive)
- [ ] Add smooth transitions between modes
- [ ] Integrate all sub-components

### 4.2 Quick Generate Component
**File**: `src/components/admin/ai-generation/AIQuickGenerate.tsx`

- [ ] Create prompt textarea (4 rows)
- [ ] Add block selection mode toggle (Auto / Manual)
- [ ] Render block selector when Manual mode selected
- [ ] Add AI model selector dropdown (GPT-4o-mini, GPT-4o)
- [ ] Display cost estimate
- [ ] Add "Generate Content" button
- [ ] Add "or" divider
- [ ] Add "Start AI Chat Session" button
- [ ] Form validation (prompt required)
- [ ] Loading states

### 4.3 Block Selector Component
**File**: `src/components/admin/ai-generation/AIBlockSelector.tsx`

- [ ] Render checkboxes for each available block type
- [ ] Show block icon, label, description
- [ ] Support multi-select
- [ ] Highlight recommended blocks
- [ ] Responsive grid layout (2-3 columns)
- [ ] "Select All" / "Deselect All" buttons

### 4.4 Model Selector Component
**File**: `src/components/admin/ai-generation/AIModelSelector.tsx`

- [ ] Dropdown with available models
- [ ] Show model details (speed, quality, cost)
- [ ] Display cost per generation
- [ ] Highlight recommended model (GPT-4o-mini)
- [ ] Badge for "Fastest", "Best Quality", etc.

### 4.5 Generation Progress Component
**File**: `src/components/admin/ai-generation/AIGenerationProgress.tsx`

- [ ] Show loading animation (spinner + sparkles)
- [ ] Display progress steps with checkmarks
  - Analyzing description
  - Generating hero
  - Generating features
  - etc.
- [ ] Progress bar (0-100%)
- [ ] Current block being generated
- [ ] "Cancel Generation" button
- [ ] Estimated time remaining

### 4.6 Content Preview Component
**File**: `src/components/admin/ai-generation/AIContentPreview.tsx`

- [ ] Display list of generated blocks
- [ ] Show block type, preview content (truncated)
- [ ] "Edit" and "Remove" buttons per block
- [ ] Expandable/collapsible block content
- [ ] Action buttons at bottom:
  - "Regenerate All"
  - "Chat to Refine"
  - "Cancel"
  - "Apply to Product"
- [ ] Success message at top
- [ ] Empty state if no blocks generated

### 4.7 Chat Interface Component
**File**: `src/components/admin/ai-generation/AIChatInterface.tsx`

- [ ] Split layout: Generated blocks (left) + Chat (right)
- [ ] Chat message list with scrolling
- [ ] Message bubbles (user vs AI)
- [ ] Typing indicator when AI is responding
- [ ] Message input field at bottom
- [ ] Send button with keyboard shortcut (Enter)
- [ ] Display generated blocks on left side
  - Checkmarks for completed blocks
  - "Suggested" badge for recommended blocks
- [ ] "Preview All" button
- [ ] "Apply to Product" button
- [ ] Model and token count display at bottom
- [ ] Back button to quick generate mode

### 4.8 Block Preview Card Component
**File**: `src/components/admin/ai-generation/AIBlockPreviewCard.tsx`

- [ ] Card showing block type and icon
- [ ] Truncated content preview
- [ ] Expand/collapse functionality
- [ ] Edit inline capability (optional)
- [ ] Remove button
- [ ] Drag handle for reordering (optional)

---

## Phase 5: Integration with Product Builder

### 5.1 Add AI Button to Product Builder Header
**File**: `src/components/admin/product-builder/ProductBuilderHeader.tsx`

- [ ] Add "✨ Generate with AI" button
- [ ] Position next to existing actions
- [ ] Use purple/gradient color scheme
- [ ] Add sparkle icon
- [ ] Open AIGenerationDialog on click
- [ ] Pass product context to dialog

### 5.2 Handle Generated Content
**File**: `src/hooks/useProductBuilder.ts`

- [ ] Create `handleAIGeneratedBlocks()` function
- [ ] Convert `GeneratedBlock[]` to product blocks format
- [ ] Merge with existing blocks or replace
- [ ] Update display_order for new blocks
- [ ] Trigger auto-save
- [ ] Show success toast notification

### 5.3 Product Builder Config
**File**: `src/components/admin/product-builder/ProductBuilderPage.tsx`

- [ ] Create `AIGenerationConfig` for products
- [ ] Define available block types
- [ ] Pass config to AIGenerationDialog
- [ ] Handle onApply callback

---

## Phase 6: Integration with Other Content Types (Future)

### 6.1 Pages
- [ ] Add AI button to page builder
- [ ] Configure available page blocks
- [ ] Test generation flow

### 6.2 Posts
- [ ] Add AI button to post builder
- [ ] Configure available post blocks
- [ ] Test generation flow

### 6.3 Directory
- [ ] Add AI button to directory builder
- [ ] Configure available directory blocks
- [ ] Test generation flow

---

## Phase 7: Database & Usage Tracking

### 7.1 Create Usage Tracking Table
**Migration**: `supabase/migrations/XXX_create_ai_usage_logs.sql`

- [ ] Create `ai_usage_logs` table
  ```sql
  - id (uuid, primary key)
  - user_id (uuid, foreign key)
  - site_id (uuid, foreign key, nullable)
  - content_type (text: product/page/post/directory)
  - model_used (text: gpt-4o-mini, gpt-4o, etc.)
  - tokens_input (integer)
  - tokens_output (integer)
  - cost_usd (decimal)
  - generation_time_ms (integer)
  - success (boolean)
  - error_message (text, nullable)
  - created_at (timestamp)
  ```
- [ ] Add indexes for user_id, site_id, created_at
- [ ] Add RLS policies (users can only see their own logs)

### 7.2 Create Rate Limiting Table
**Migration**: `supabase/migrations/XXX_create_ai_rate_limits.sql`

- [ ] Create `ai_rate_limits` table
  ```sql
  - user_id (uuid, primary key)
  - daily_count (integer)
  - hourly_count (integer)
  - last_daily_reset (timestamp)
  - last_hourly_reset (timestamp)
  ```
- [ ] Add function to check/update rate limits
- [ ] Add RLS policies

### 7.3 Usage Dashboard (Optional)
**File**: `src/app/admin/ai-usage/page.tsx`

- [ ] Display user's AI usage stats
- [ ] Show total generations this month
- [ ] Show total cost
- [ ] Show remaining daily limit
- [ ] Chart of usage over time
- [ ] List recent generations with details

---

## Phase 8: Testing & Refinement

### 8.1 Unit Tests
- [ ] Test prompt template generation
- [ ] Test block generation logic
- [ ] Test content sanitization
- [ ] Test token counting accuracy
- [ ] Test rate limiting logic

### 8.2 Integration Tests
- [ ] Test full generation flow (prompt → blocks → apply)
- [ ] Test chat-based refinement
- [ ] Test error handling (API failures, rate limits)
- [ ] Test concurrent generations

### 8.3 UI/UX Testing
- [ ] Test modal responsiveness
- [ ] Test all button states (loading, disabled, etc.)
- [ ] Test keyboard navigation
- [ ] Test accessibility (screen readers, ARIA labels)
- [ ] Test dark mode compatibility

### 8.4 Prompt Engineering
- [ ] Test with various product descriptions
- [ ] Refine prompts for better output quality
- [ ] Test edge cases (very short/long descriptions)
- [ ] Ensure generated content matches brand voice
- [ ] Test multi-language support (if needed)

### 8.5 Cost Optimization
- [ ] Measure actual token usage vs estimates
- [ ] Optimize prompts to reduce token count
- [ ] Implement prompt caching where possible
- [ ] Test cost difference between models
- [ ] Set up cost alerts for high usage

---

## Phase 9: Documentation

### 9.1 User Documentation
**File**: `docs/features/ai-generation.md`

- [ ] How to use AI generation
- [ ] Quick generate vs chat mode
- [ ] Tips for writing good prompts
- [ ] Explaining block types
- [ ] Cost information
- [ ] Rate limits and usage

### 9.2 Developer Documentation
**File**: `docs/development/ai-generation.md`

- [ ] Architecture overview
- [ ] How to add new block types
- [ ] How to add new AI models
- [ ] Prompt template guidelines
- [ ] API reference for server actions
- [ ] Testing guidelines

### 9.3 API Key Setup Guide
**File**: `docs/setup/openai-api-key.md`

- [ ] How to get OpenAI API key
- [ ] Where to add it in .env
- [ ] Security best practices
- [ ] Cost management tips

---

## Phase 10: Launch & Monitoring

### 10.1 Pre-Launch Checklist
- [ ] All components implemented and tested
- [ ] Error handling in place
- [ ] Rate limiting active
- [ ] Usage logging working
- [ ] Cost tracking accurate
- [ ] Documentation complete
- [ ] Security review passed

### 10.2 Monitoring Setup
- [ ] Set up error tracking (Sentry/similar)
- [ ] Monitor API usage and costs
- [ ] Track generation success rate
- [ ] Monitor performance (generation time)
- [ ] Set up alerts for:
  - High error rate
  - Cost spikes
  - Rate limit violations

### 10.3 Post-Launch
- [ ] Gather user feedback
- [ ] Monitor actual costs
- [ ] Refine prompts based on results
- [ ] Optimize performance bottlenecks
- [ ] Plan v2 improvements

---

## Future Enhancements

### V2 Features
- [ ] Image generation for featured images
- [ ] Multi-language content generation
- [ ] Brand voice customization
- [ ] Template library (save/reuse prompts)
- [ ] Bulk generation (multiple products at once)
- [ ] A/B testing suggestions
- [ ] SEO optimization suggestions
- [ ] Auto-translate generated content

### UI Improvements
- [ ] Slide-over panel option (instead of modal)
- [ ] Full-screen mode for complex generations
- [ ] Drag-and-drop block reordering in preview
- [ ] Inline editing of generated content
- [ ] Undo/redo for chat refinements
- [ ] Keyboard shortcuts for power users

### AI Model Expansion
- [ ] Add Anthropic Claude support
- [ ] Add Google Gemini support
- [ ] Add open-source models (Llama, etc.)
- [ ] Model comparison feature
- [ ] Auto-select best model based on task

---

## Cost Estimates & Projections

### Per Generation Costs (GPT-4o-mini)
- Input: ~2,000 tokens × $0.0025 = $0.005
- Output: ~2,500 tokens × $0.010 = $0.025
- **Total: ~$0.002-0.003 per generation**

### Monthly Cost Projections
| Usage Level | Generations/Month | Cost/Month |
|-------------|-------------------|------------|
| Light       | 10                | $0.02-0.03 |
| Medium      | 100               | $0.20-0.30 |
| Heavy       | 500               | $1.00-1.50 |
| Power User  | 2000              | $4.00-6.00 |

### Rate Limits (Recommended)
- Daily: 50 generations per user
- Hourly: 10 chat sessions per user
- Monthly: 1000 generations per site

---

## Success Metrics

### Technical Metrics
- Generation success rate > 95%
- Average generation time < 10 seconds
- API error rate < 1%
- Cost per generation < $0.005

### User Metrics
- % of products created with AI
- Average time saved per product
- User satisfaction (feedback/surveys)
- Feature adoption rate

---

## Risk Mitigation

### Technical Risks
- **API failures**: Implement retry logic and fallbacks
- **Cost overruns**: Strict rate limiting and monitoring
- **Poor quality output**: Extensive prompt testing and refinement
- **Security vulnerabilities**: Content sanitization and validation

### Business Risks
- **High costs**: Start with conservative rate limits
- **Low adoption**: Gather feedback and iterate quickly
- **Competitor features**: Keep improving and differentiating

---

## Timeline Estimate

| Phase | Estimated Time | Priority |
|-------|----------------|----------|
| Phase 1: Foundation | 2-3 hours | High |
| Phase 2: AI Service | 4-6 hours | High |
| Phase 3: Server Actions | 3-4 hours | High |
| Phase 4: UI Components | 8-10 hours | High |
| Phase 5: Product Integration | 2-3 hours | High |
| Phase 6: Other Content Types | 3-4 hours | Medium |
| Phase 7: Database & Tracking | 2-3 hours | High |
| Phase 8: Testing | 4-6 hours | High |
| Phase 9: Documentation | 2-3 hours | Medium |
| Phase 10: Launch & Monitor | 2-3 hours | High |

**Total Estimated Time**: 32-45 hours

---

## Getting Started

### Immediate Next Steps
1. Install dependencies (ai, @ai-sdk/openai)
2. Add OpenAI API key to environment
3. Create type definitions
4. Build block configuration
5. Create prompt templates
6. Start building UI components

### Development Order
1. Build UI components first (can use mock data)
2. Implement AI service layer
3. Create server actions
4. Connect everything together
5. Add usage tracking and rate limiting
6. Test and refine
7. Document and launch

---

## Notes

- Keep all AI-related code in dedicated directories for maintainability
- Make components reusable from the start (products, pages, posts, directory)
- Prioritize security (sanitization, validation, rate limiting)
- Monitor costs closely in production
- Gather user feedback early and often
- Start with conservative rate limits, increase as needed

---

**Document Version**: 1.0
**Last Updated**: 2025-10-18
**Status**: Planning Phase
