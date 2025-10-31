# Lead Magnet Email Delivery with Flodesk Integration

## Overview

Implement a complete lead magnet system for free products with email delivery via Resend and optional Flodesk newsletter integration. This is separate from the existing paid product/Stripe checkout flow.

## Goals

1. **Free Product Flow**: User enters email → receives product content via email → redirected to thank you page
2. **Email Delivery**: Send product content inline via Resend
3. **Flodesk Integration**: Add engaged users (who click links in email) to Flodesk newsletter with product-specific tags
4. **Multi-tenant**: Each site can configure their own Resend/Flodesk credentials
5. **Tracking**: Record all signups and track engagement

---

## User Flows

### Free Product (Lead Magnet) Flow

```
User visits product page
  ↓
Sees email capture form (LeadMagnetBlock component)
  ↓
Enters email → clicks submit
  ↓
POST /api/products/signup
  - Validates email
  - Creates signup record with unique token
  - Sends email via Resend with product content
  ↓
User redirected to /products/[slug]/free-thank-you?email=user@example.com
  ↓
Thank you page displays "Check your email at user@example.com for your [Product Name]"
  ↓
User receives email with product content
  ↓
User clicks ANY link in email
  ↓
GET /api/track/click/[token]
  - Validates token
  - Marks signup as "clicked" in database
  - Adds to Flodesk (if enabled) with tag "lead-magnet-[product-slug]"
  - Redirects to destination URL or shows content
```

### Paid Product Flow (Existing - Enhanced)

```
User visits product page
  ↓
Sees pricing/checkout UI (ProductPricingBlock component)
  ↓
Completes Stripe payment
  ↓
Stripe webhook: checkout.session.completed
  - Creates order record
  - Sends email via Resend with product content
  - Optionally adds to Flodesk
  ↓
User redirected to /products/[slug]/success
  ↓
Success page shows "Check your email" + displays content immediately
```

---

## Database Schema

### 1. Site Integrations Table (NEW)

```sql
CREATE TABLE site_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  integration_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(site_id, integration_type)
);

CREATE INDEX idx_site_integrations_site_id ON site_integrations(site_id);
CREATE INDEX idx_site_integrations_type ON site_integrations(integration_type);
CREATE INDEX idx_site_integrations_enabled ON site_integrations(site_id, is_enabled);
```

**Integration Types & Config Examples:**

```typescript
// Flodesk
{
  integration_type: 'flodesk',
  config: {
    api_key: 'fk_abc123...',
    segment_id: 'seg_xyz789'
  }
}

// Resend (per-site custom sending)
{
  integration_type: 'resend',
  config: {
    api_key: 're_custom123...',  // Optional: site's own Resend key
    from_email: 'hello@customdomain.com',
    from_name: 'Custom Brand'
  }
}

// Future: ConvertKit
{
  integration_type: 'convertkit',
  config: {
    api_key: 'ck_123...',
    form_id: '1234567'
  }
}
```

### 2. Product Signups/Orders Table (NEW)

Universal table for both free signups and paid purchases.

```sql
CREATE TYPE order_type_enum AS ENUM ('free_signup', 'paid_purchase');
CREATE TYPE payment_status_enum AS ENUM ('pending', 'succeeded', 'failed', 'canceled');

CREATE TABLE product_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Customer info
  customer_email VARCHAR(255) NOT NULL,

  -- Order classification
  order_type order_type_enum NOT NULL,

  -- Payment info (nullable for free products)
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  amount_total INTEGER,  -- in cents
  currency VARCHAR(3),
  payment_status payment_status_enum,

  -- Engagement tracking
  access_token VARCHAR(255) UNIQUE NOT NULL,  -- For email link tracking
  clicked_at TIMESTAMP WITH TIME ZONE,
  click_count INTEGER DEFAULT 0,

  -- Integration tracking
  email_sent_at TIMESTAMP WITH TIME ZONE,
  flodesk_added_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  metadata JSONB,  -- Store additional info (user agent, referrer, etc.)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_product_orders_site_id ON product_orders(site_id);
CREATE INDEX idx_product_orders_product_id ON product_orders(product_id);
CREATE INDEX idx_product_orders_email ON product_orders(customer_email);
CREATE INDEX idx_product_orders_type ON product_orders(order_type);
CREATE INDEX idx_product_orders_stripe_session ON product_orders(stripe_session_id);
CREATE INDEX idx_product_orders_token ON product_orders(access_token);
CREATE INDEX idx_product_orders_clicked ON product_orders(clicked_at) WHERE clicked_at IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_product_orders_email_product ON product_orders(customer_email, product_id);
CREATE INDEX idx_product_orders_site_type ON product_orders(site_id, order_type);
```

### 3. Block Type Addition

Add new block type to existing products:

```typescript
// In product content_blocks JSONB
{
  "block-uuid-1": {
    "type": "lead_magnet",
    "formSettings": {
      "heading": "Get Your Free SEO Checklist",
      "description": "Enter your email to receive the complete guide",
      "buttonText": "Send Me The Guide",
      "emailPlaceholder": "your@email.com"
    },
    "emailSettings": {
      "subject": "Here's Your Free SEO Checklist!",
      "fromName": "Tyler from SiteBuilder",
      "replyTo": "tyler@example.com"
    },
    "emailContent": "<h1>Your SEO Checklist</h1><p>...</p>",  // Rich HTML
    "thankYouSettings": {
      "message": "Check your email for your free SEO checklist!",
      "redirectUrl": null  // Optional redirect after X seconds
    },
    "flodeskSettings": {
      "enabled": true,
      "customTag": null  // Optional override of auto-generated tag
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Database & Configuration

**1.1 Create Migrations**
- [ ] `supabase/migrations/0XX_create_site_integrations_table.sql`
- [ ] `supabase/migrations/0XX_create_product_orders_table.sql`

**1.2 Environment Variables**
- [ ] Add to `.env.example`:
  ```env
  # Email Delivery (Resend)
  RESEND_API_KEY=re_xxxxx
  DEFAULT_FROM_EMAIL=noreply@yourdomain.com
  DEFAULT_FROM_NAME=Your App Name

  # Flodesk (Optional - can be configured per-site)
  FLODESK_API_KEY=fk_xxxxx
  FLODESK_SEGMENT_ID=seg_xxxxx
  ```

**1.3 Install Dependencies**
- [ ] `npm install resend`
- [ ] No Flodesk SDK - use fetch API directly

### Phase 2: Backend Services

**2.1 Email Service** (`src/lib/email/email-service.ts`)
```typescript
import { Resend } from 'resend'

interface EmailConfig {
  apiKey?: string
  fromEmail?: string
  fromName?: string
}

interface SendProductEmailParams {
  to: string
  subject: string
  content: string  // HTML content
  productSlug: string
  token: string
  config?: EmailConfig
}

class EmailService {
  async sendProductDeliveryEmail(params: SendProductEmailParams) {
    // Initialize Resend with site-specific or default API key
    // Transform content to replace all links with tracking links
    // Send email
    // Return success/failure
  }

  private transformLinksToTracking(html: string, token: string) {
    // Replace all <a href="..."> with /api/track/click/[token]?redirect=...
    // Handle relative and absolute URLs
  }
}
```

**2.2 Flodesk Service** (`src/lib/integrations/flodesk-service.ts`)
```typescript
interface FlodeskConfig {
  apiKey: string
  segmentId: string
}

interface AddSubscriberParams {
  email: string
  segmentId: string
  tags?: string[]
}

class FlodeskService {
  async addSubscriber(config: FlodeskConfig, params: AddSubscriberParams) {
    // POST to Flodesk API
    // Handle errors gracefully (don't fail if Flodesk is down)
  }
}
```

**2.3 Integration Actions** (`src/lib/actions/integrations/integration-actions.ts`)
```typescript
export async function getSiteIntegration(
  siteId: string,
  integrationType: string
): Promise<SiteIntegration | null>

export async function createOrUpdateIntegration(
  siteId: string,
  integrationType: string,
  config: Record<string, any>,
  isEnabled: boolean
): Promise<SiteIntegration>

export async function toggleIntegration(
  integrationId: string,
  isEnabled: boolean
): Promise<void>
```

**2.4 Order Actions** (`src/lib/actions/orders/order-actions.ts`)
```typescript
export async function createFreeSignup(params: {
  siteId: string
  productId: string
  email: string
  metadata?: Record<string, any>
}): Promise<ProductOrder>

export async function createPaidOrder(params: {
  siteId: string
  productId: string
  email: string
  stripeSessionId: string
  stripePaymentIntentId: string
  amountTotal: number
  currency: string
  metadata?: Record<string, any>
}): Promise<ProductOrder>

export async function markEmailSent(orderId: string): Promise<void>

export async function markLinkClicked(token: string): Promise<ProductOrder>

export async function markFlodeskAdded(orderId: string): Promise<void>

export async function getOrderByToken(token: string): Promise<ProductOrder | null>
```

### Phase 3: API Routes

**3.1 Free Product Signup** (`src/app/api/products/signup/route.ts`)
```typescript
POST /api/products/signup
Body: { email: string, productSlug: string }

Flow:
1. Validate email format
2. Get product by slug + verify it has lead_magnet block
3. Check rate limiting (prevent spam)
4. Create signup record with unique token
5. Get site integrations (Resend config)
6. Send email with product content via Resend
7. Mark email as sent
8. Return success { success: true, redirectUrl: '/products/[slug]/free-thank-you?email=...' }
```

**3.2 Link Click Tracking** (`src/app/api/track/click/[token]/route.ts`)
```typescript
GET /api/track/click/[token]?redirect=https://example.com

Flow:
1. Validate token
2. Get order record by token
3. If first click:
   - Mark as clicked (clicked_at, increment click_count)
   - Get site's Flodesk integration
   - If enabled, add to Flodesk with tag "lead-magnet-{product-slug}"
   - Mark flodesk_added_at
4. If redirect param: redirect to URL
5. Else: show a simple page with "Opening your content..."
```

**3.3 Webhook Enhancement** (`src/app/api/webhooks/stripe/route.ts`)
```typescript
// Enhance existing webhook handler
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session

  // 1. Get product details
  const product = await getProductBySlug(session.metadata?.productSlug)

  // 2. Create paid order record
  const order = await createPaidOrder({
    siteId: product.site_id,
    productId: product.id,
    email: session.customer_details?.email!,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent as string,
    amountTotal: session.amount_total!,
    currency: session.currency!
  })

  // 3. Get site integrations
  const resendConfig = await getSiteIntegration(product.site_id, 'resend')

  // 4. Get product content from pricing block's downloadSettings
  const pricingBlock = Object.values(product.content_blocks).find(
    block => block.type === 'pricing'
  )

  // 5. Send email with product content
  await emailService.sendProductDeliveryEmail({
    to: order.customer_email,
    subject: `Your ${product.title} is ready!`,
    content: pricingBlock.downloadSettings.content,
    productSlug: product.slug,
    token: order.access_token,
    config: resendConfig?.config
  })

  // 6. Mark email sent
  await markEmailSent(order.id)

  // 7. Optionally add to Flodesk immediately (or wait for click)
  // Decision: Wait for click to ensure engagement

  break
}
```

### Phase 4: Frontend Components

**4.1 Lead Magnet Block Admin** (`src/components/admin/product-builder/blocks/LeadMagnetBlock.tsx`)
```typescript
// Similar structure to ProductPricingBlock.tsx
// Tabs: Form Settings, Email Settings, Email Content, Thank You Page, Flodesk

interface LeadMagnetBlockProps {
  block: LeadMagnetBlock
  onUpdate: (block: LeadMagnetBlock) => void
  onDelete: () => void
}

// Form Settings Tab:
- Heading input
- Description textarea
- Button text input
- Email placeholder input

// Email Settings Tab:
- Subject line input
- From name input
- Reply-to email input

// Email Content Tab:
- TipTap rich text editor (reuse from DownloadSettings)
- Preview button

// Thank You Page Tab:
- Thank you message textarea
- Optional redirect URL

// Flodesk Tab:
- Enable/disable toggle
- Custom tag input (optional override)
- Test integration button
```

**4.2 Lead Magnet Form Component** (`src/components/frontend/products/LeadMagnetForm.tsx`)
```typescript
'use client'

interface LeadMagnetFormProps {
  productSlug: string
  settings: LeadMagnetBlock['formSettings']
}

// Features:
- Email input with validation
- Loading state during submission
- Error handling (display errors)
- Success redirect to thank you page
- Client-side email validation
- Accessible form (aria labels, etc.)
```

**4.3 Free Thank You Page** (`src/app/products/[slug]/free-thank-you/page.tsx`)
```typescript
interface PageProps {
  params: { slug: string }
  searchParams: { email?: string }
}

// Features:
- Display product title
- Show "Check your email at {email}"
- Display custom thank you message from block settings
- Show product description/teaser
- Optional: countdown timer before redirect
- No content shown (content only in email)
```

**4.4 Product Display Page Enhancement** (`src/app/products/[slug]/page.tsx`)
```typescript
// Conditional rendering based on blocks present:

const leadMagnetBlock = getBlockByType(product.content_blocks, 'lead_magnet')
const pricingBlock = getBlockByType(product.content_blocks, 'pricing')

if (leadMagnetBlock) {
  return <LeadMagnetForm productSlug={product.slug} settings={leadMagnetBlock.formSettings} />
}

if (pricingBlock) {
  return <ProductPricing product={product} block={pricingBlock} />
}

// Could have BOTH blocks (lead magnet + upsell to paid)
```

**4.5 Site Settings - Integrations Page** (`src/app/admin/sites/[id]/settings/integrations/page.tsx`)
```typescript
// New settings page for managing integrations

interface Integration {
  id: string
  type: string
  isEnabled: boolean
  config: Record<string, any>
}

// UI Sections:
- Email Marketing
  - Flodesk [Configure] [Enable/Disable]
  - ConvertKit [Set Up]
  - Mailchimp [Set Up]

- Email Delivery
  - Resend [Configure] (optional custom API key per site)

- Future: Analytics, Webhooks, etc.

// Each integration has a config modal/form
```

### Phase 5: Email Templates

**5.1 Product Delivery Email Template** (`src/lib/email/templates/product-delivery.ts`)
```typescript
interface ProductEmailProps {
  productTitle: string
  content: string  // Rich HTML from admin
  recipientEmail: string
  trackingToken: string
}

export function generateProductEmail(props: ProductEmailProps): string {
  // Return full HTML email with:
  // - Header with branding
  // - Product content (props.content with links transformed)
  // - Footer with unsubscribe, etc.
  // - Responsive design
  // - All links wrapped with tracking
}

// Optional: Use React Email for better templating
// import { Html, Text, Button } from '@react-email/components'
```

### Phase 6: Enhanced Paid Product Flow

**6.1 Update Success Page** (`src/app/products/[slug]/success/page.tsx`)
```typescript
// Current: Shows content from downloadSettings
// Enhancement: Also mention email delivery

<div>
  <h1>Payment Successful!</h1>
  <p>Your {product.title} is ready!</p>

  {/* Show content immediately */}
  <div dangerouslySetInnerHTML={{ __html: downloadContent }} />

  {/* NEW: Also mention email */}
  <div className="mt-8 p-4 bg-blue-50 rounded">
    <p>📧 We've also sent this to <strong>{customerEmail}</strong> for your records.</p>
  </div>
</div>
```

---

## Link Tracking Implementation Details

### How Link Transformation Works

**Original email content from admin:**
```html
<h1>Your SEO Guide</h1>
<p>Click here to download: <a href="https://example.com/guide.pdf">Download PDF</a></p>
<p>Learn more: <a href="https://example.com/blog">Visit our blog</a></p>
```

**Transformed email sent to user:**
```html
<h1>Your SEO Guide</h1>
<p>Click here to download: <a href="https://yoursite.com/api/track/click/abc123?redirect=https://example.com/guide.pdf">Download PDF</a></p>
<p>Learn more: <a href="https://yoursite.com/api/track/click/abc123?redirect=https://example.com/blog">Visit our blog</a></p>
```

**When user clicks any link:**
```
GET /api/track/click/abc123?redirect=https://example.com/guide.pdf

1. Validate token "abc123"
2. Get order record
3. If first click:
   - Mark clicked_at = NOW()
   - Get Flodesk config for this site
   - Call Flodesk API:
     POST https://api.flodesk.com/v1/subscribers
     {
       "email": "user@example.com",
       "segment_id": "seg_xyz789",
       "tags": ["lead-magnet-seo-guide"]
     }
   - Mark flodesk_added_at = NOW()
4. Increment click_count
5. Redirect to: https://example.com/guide.pdf
```

### Token Generation

```typescript
import { randomBytes } from 'crypto'

function generateAccessToken(): string {
  // Generate cryptographically secure random token
  return randomBytes(32).toString('base64url')
  // Example: "xK9mP2nQ4rS6tU8vW0yA1bC3dE5fG7hI9jK0lM2nO4pQ6"
}
```

### Security Considerations

- Tokens are long and random (hard to guess)
- Each token is unique per signup
- Tokens don't expire (user can click anytime)
- Optionally: Add expiration if needed
- Track click count to detect suspicious activity
- Rate limit the click endpoint

---

## Admin UI Mockups

### Lead Magnet Block Editor

```
┌─────────────────────────────────────────────────────────┐
│ Lead Magnet Block                          [⋮] [Delete] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ [Form Settings] [Email Settings] [Email Content]        │
│ [Thank You Page] [Flodesk]                              │
│                                                          │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Form Settings                                     │   │
│ │                                                   │   │
│ │ Heading                                           │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ Get Your Free SEO Checklist               │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │                                                   │   │
│ │ Description                                       │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ Enter your email to receive the complete  │   │   │
│ │ │ guide with actionable tips...             │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │                                                   │   │
│ │ Button Text                                       │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ Send Me The Guide                         │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │                                                   │   │
│ │ Email Placeholder                                 │   │
│ │ ┌─────────────────────────────────────────────┐   │   │
│ │ │ your@email.com                            │   │   │
│ │ └─────────────────────────────────────────────┘   │   │
│ │                                                   │   │
│ │ [Preview Form]                                    │   │
│ └───────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Site Integrations Settings

```
┌─────────────────────────────────────────────────────────┐
│ Site Settings > Integrations                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 📧 Email Marketing                                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Flodesk                              [Enabled ✓]    │ │
│ │ Send lead magnets to your Flodesk newsletter        │ │
│ │                                                      │ │
│ │ Segment ID: seg_xyz789                              │ │
│ │ [Configure] [Test Connection] [Disable]             │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ConvertKit                           [Not Set Up]   │ │
│ │ Alternative email marketing platform                │ │
│ │                                                      │ │
│ │ [Set Up]                                            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ 📨 Email Delivery (Advanced)                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Resend                               [Use Default]  │ │
│ │ Using default: noreply@yourdomain.com               │ │
│ │                                                      │ │
│ │ □ Use custom Resend API key                         │ │
│ │ [Configure Custom]                                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Testing Plan

### Unit Tests

- [ ] Email service link transformation
- [ ] Token generation uniqueness
- [ ] Flodesk API integration (mocked)
- [ ] Order creation functions

### Integration Tests

- [ ] Full signup flow (email → order → email sent)
- [ ] Click tracking flow (click → Flodesk addition)
- [ ] Paid order flow (Stripe → email → Flodesk)
- [ ] Multi-site isolation (Site A's Flodesk ≠ Site B's)

### Manual Testing Checklist

**Free Product Flow:**
- [ ] Submit email on lead magnet page
- [ ] Receive email with content
- [ ] All links in email work and track correctly
- [ ] Clicking link adds to Flodesk
- [ ] Clicking link again doesn't duplicate in Flodesk
- [ ] Thank you page displays correctly
- [ ] Email validation works (invalid emails rejected)

**Paid Product Flow:**
- [ ] Complete Stripe checkout
- [ ] Receive email with product content
- [ ] Success page shows content + email confirmation
- [ ] Clicking email links tracks correctly
- [ ] Added to Flodesk with correct tag

**Admin Experience:**
- [ ] Create lead magnet block in product builder
- [ ] Configure all settings (form, email, content)
- [ ] Preview email template
- [ ] Configure Flodesk in site settings
- [ ] Test Flodesk connection
- [ ] Disable/enable integration

**Error Scenarios:**
- [ ] Invalid email format
- [ ] Resend API failure (graceful error)
- [ ] Flodesk API failure (doesn't break signup)
- [ ] Invalid token in click tracking
- [ ] Duplicate email submissions (rate limiting)

---

## Migration Strategy

### Existing Products

- Products with `pricing` block continue to work as-is
- No changes required to existing paid products
- Can add `lead_magnet` block to existing products (freemium model)

### Rollout Plan

1. **Phase 1**: Database migrations + backend services
2. **Phase 2**: Admin UI for integrations settings
3. **Phase 3**: Lead magnet block in product builder
4. **Phase 4**: Frontend components + API routes
5. **Phase 5**: Enhanced paid product email delivery
6. **Phase 6**: Testing + refinement

---

## Future Enhancements

### V1 (MVP)
- [x] Free product email capture
- [x] Email delivery via Resend
- [x] Click tracking → Flodesk
- [x] Paid product email delivery
- [x] Site-level integrations

### V2 (Future)
- [ ] Email analytics dashboard (open rates, click rates)
- [ ] A/B testing for lead magnet forms
- [ ] Multi-step lead magnets (email course)
- [ ] Drip campaigns after signup
- [ ] Integration with other email providers (ConvertKit, Mailchimp)
- [ ] Custom email templates per product
- [ ] Segment subscribers by product tags
- [ ] Resend emails to customers (customer portal)
- [ ] Export email list to CSV
- [ ] GDPR compliance tools (unsubscribe, data export)

### V3 (Advanced)
- [ ] Advanced automation workflows
- [ ] Lead scoring based on engagement
- [ ] Integration with CRM systems
- [ ] Webhooks for third-party integrations
- [ ] Multi-language email support

---

## Technical Debt & Considerations

### Performance
- **Link transformation**: Parsing HTML to replace links could be slow for large content. Consider caching transformed content.
- **Flodesk API calls**: Make async/background job if it slows down click response
- **Database queries**: Ensure indexes are optimized for high-traffic products

### Security
- **Token security**: Tokens are random and long, but consider adding expiration
- **Rate limiting**: Prevent spam signups (same email, same IP)
- **CORS**: Ensure API routes have proper CORS if embedded in external sites
- **Secrets management**: Encrypt integration API keys in database

### Scalability
- **Email volume**: Resend free tier = 3k emails/month. Monitor usage.
- **Background jobs**: For high-volume, consider queue system (BullMQ, etc.)
- **CDN**: Host large files (PDFs) on R2/S3, link in emails

### UX Considerations
- **Mobile responsive**: Email forms and emails must work on mobile
- **Accessibility**: Ensure forms have proper labels and ARIA attributes
- **Email deliverability**: Use proper SPF/DKIM/DMARC records
- **Unsubscribe**: Add unsubscribe link in emails (legal requirement)

---

## Questions for Discussion

1. **Email Content Storage**: Should we store the sent email content in the database for records? Or just rely on Resend's dashboard?

2. **Double Opt-in**: Should we require email confirmation before sending the lead magnet? (Better list quality but friction)

3. **Purchase History**: Should users be able to view their past purchases/signups? (Customer portal)

4. **Resend Webhooks**: Should we listen to Resend webhooks for bounces, opens, clicks? Or just use our own tracking?

5. **Flodesk Fallback**: If Flodesk API is down during click, should we retry later? Or just log and skip?

6. **Per-Product Email Settings**: Should each lead magnet have its own from_name/reply_to? Or always use site-level?

7. **Thank You Page Content**: Should we allow showing a preview/teaser of the content on thank you page? Or keep it email-only?

8. **Analytics**: What metrics should we track? (signups, clicks, conversion rates, etc.)

---

## Conclusion

This implementation provides a complete, production-ready lead magnet system with:

✅ **Free product email capture** - Simple, conversion-optimized forms
✅ **Email delivery** - Reliable delivery via Resend with rich content
✅ **Engagement tracking** - Click tracking ensures quality subscribers
✅ **Flodesk integration** - Automatic newsletter addition with product tags
✅ **Multi-tenant support** - Each site configures their own integrations
✅ **Scalable architecture** - Supports future integrations and features
✅ **Paid product enhancement** - Unified email delivery for free & paid

The system is designed to grow with your needs, supporting multiple email providers, advanced analytics, and automation workflows in the future.

---

## Phase 2: Automatic Account Creation for Lead Magnet Users

### Overview

Enhance the lead magnet system to automatically create user accounts when users click links in their lead magnet emails. This allows users to access their lead magnets through a persistent account without requiring manual sign-up, while keeping tokens secure and maintaining complete separation from admin authentication.

### Goals

1. **Seamless Account Creation**: Auto-create accounts on first email link click (email verification)
2. **Password Management**: Generate secure temporary passwords and send magic links for users to set custom passwords
3. **User Flow Differentiation**: Different experiences for new users vs existing users
4. **Token Security**: Keep tokens in `product_orders` table (per-order, not per-user)
5. **No Admin Conflict**: Lead magnet users created as regular users with no admin privileges

---

## Updated User Flow

### Free Product (Lead Magnet) Flow - Phase 2 Enhancement

```
User visits product page
  ↓
Sees email capture form (LeadMagnetBlock component)
  ↓
Enters email → clicks submit
  ↓
POST /api/products/signup
  - Validates email
  - Creates signup record with unique token
  - Sends email via Resend with product content
  ↓
User redirected to /products/[slug]/free-thank-you?email=user@example.com
  ↓
Thank you page displays "Check your email at user@example.com for your [Product Name]"
  ↓
User receives email with product content
  ↓
User clicks ANY link in email (FIRST TIME)
  ↓
GET /api/track/click/[token]
  - Validates token
  - Marks signup as "clicked" in database

  **NEW - Account Creation Logic:**
  - Check if auth.users has account with this email

  IF NEW USER (No account exists):
    - Create account in auth.users with random secure password
    - Auto-confirm email (already verified by click)
    - Store creation metadata (created_from: 'lead_magnet', site_id, product_id)
    - Link order to user (update product_orders.user_id)
    - Send welcome email with magic link to set password
    - Email includes: "Your account has been created! Set your password to access your lead magnets anytime"

  IF EXISTING USER (Account exists):
    - Link order to existing user account
    - Send notification email: "New lead magnet added to your account! Login to access all your content"
    - Email includes: Login link

  - Adds to Flodesk (if enabled) with tag "lead-magnet-[product-slug]"
  - Redirects to destination URL or shows content
```

---

## Database Schema Changes - Phase 2

### 1. Update Product Orders Table

Add `user_id` column to link orders to user accounts:

```sql
-- Migration: 066_add_user_id_to_product_orders.sql

ALTER TABLE product_orders
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_product_orders_user_id ON product_orders(user_id);

-- Composite index for user dashboard queries
CREATE INDEX idx_product_orders_user_site ON product_orders(user_id, site_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN product_orders.user_id IS 'Links order to auth.users account. NULL for orders before Phase 2 implementation or if user account deleted.';
```

**Why this design:**
- **Foreign key to `auth.users`**: Direct relationship, proper referential integrity
- **ON DELETE SET NULL**: If user deletes account, orders remain for analytics but orphaned
- **site_id remains unchanged**: Tracks which site the order came from
- **Tokens stay in product_orders**: Each order has its own token, easier to query and track
- **No JSON token storage**: Indexed column is faster and cleaner than JSON search

### 2. User Metadata Structure

Store account creation context in `auth.users` metadata:

```typescript
// Stored in auth.users.user_metadata
{
  created_from: "lead_magnet",  // How account was created
  first_lead_magnet_site_id: "uuid-site-id",
  first_lead_magnet_product_id: "uuid-product-id",
  first_lead_magnet_product_slug: "free-seo-guide",
  lead_magnet_count: 3,  // Number of lead magnets collected
  sites_interacted_with: ["site-uuid-1", "site-uuid-2"],  // Track multi-site usage
  account_created_at: "2025-10-31T12:00:00Z"
}
```

**Why store this:**
- Track user acquisition source (lead magnet vs manual signup)
- Analytics: Which products drive most account creation
- User dashboard: Show their first lead magnet prominently
- Marketing: Segment users by lead magnets collected

---

## Authentication Architecture

### Admin vs Regular User Separation

**Critical Security Information:**

1. **Admin Authentication:**
   - Admins exist in `auth.users` table with `raw_app_meta_data->>'role' = 'admin'`
   - Admin role is set manually via Supabase dashboard or service role API
   - RLS policies check for `role = 'admin'` to grant access to admin-only tables
   - Same login page (`/login`) but different permissions based on role

2. **Lead Magnet User Authentication:**
   - Created in `auth.users` table WITHOUT admin role (regular user)
   - Created with random secure password and auto-confirmed email
   - RLS policies prevent access to admin tables (no `role = 'admin'`)
   - Can only access their own data (orders, lead magnets)

3. **Zero Conflict Guarantee:**
   - Lead magnet users CANNOT access admin routes
   - RLS policies enforce database-level security
   - No application logic exists to elevate regular users to admin
   - Admin role must be manually set (cannot be self-assigned)

**Login Flow Diagram:**

```
┌──────────────────────────────────────────────────┐
│            /login (Shared Page)                  │
├──────────────────────────────────────────────────┤
│  Email: [_______________]                        │
│  Password: [_______________]                     │
│  [Login Button]                                  │
└──────────────────────────────────────────────────┘
                      ↓
        Supabase Auth validates credentials
                      ↓
         ┌────────────────────────┐
         │  Check user metadata   │
         └────────────────────────┘
                      ↓
        ┌─────────────┴──────────────┐
        ↓                            ↓
┌───────────────┐          ┌──────────────────┐
│  ADMIN USER   │          │  REGULAR USER    │
│  role: admin  │          │  role: (none)    │
└───────────────┘          └──────────────────┘
        ↓                            ↓
  Redirects to                 Redirects to
  /admin                       /dashboard
        ↓                            ↓
  RLS allows                   RLS blocks
  admin tables                 admin tables
```

---

## Implementation Details - Phase 2

### 1. New Auth Helper Functions

**File:** `src/lib/actions/auth/account-auto-creation.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

// Admin client for creating users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * Check if user exists by email
 */
export async function checkUserExists(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()

  if (error) {
    console.error('Error checking user existence:', error)
    return false
  }

  return data.users.some(user => user.email === email)
}

/**
 * Create auto-account for lead magnet user
 */
export async function createAutoAccount(params: {
  email: string
  siteId: string
  productId: string
  productSlug: string
}) {
  // Generate secure random password
  const tempPassword = randomBytes(32).toString('base64url')

  // Create user with auto-confirmed email
  const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: tempPassword,
    email_confirm: true,  // Skip confirmation (already verified by email click)
    user_metadata: {
      created_from: 'lead_magnet',
      first_lead_magnet_site_id: params.siteId,
      first_lead_magnet_product_id: params.productId,
      first_lead_magnet_product_slug: params.productSlug,
      lead_magnet_count: 1,
      sites_interacted_with: [params.siteId],
      account_created_at: new Date().toISOString(),
    },
  })

  if (error) {
    throw new Error(`Failed to create auto-account: ${error.message}`)
  }

  return newUser.user
}

/**
 * Send magic link for password setup
 */
export async function sendPasswordSetupEmail(email: string, siteUrl: string) {
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/set-password`,
  })

  if (error) {
    console.error('Error sending password setup email:', error)
    throw new Error('Failed to send password setup email')
  }
}

/**
 * Link order to user account
 */
export async function linkOrderToUser(orderId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from('product_orders')
    .update({ user_id: userId })
    .eq('id', orderId)

  if (error) {
    throw new Error(`Failed to link order to user: ${error.message}`)
  }
}
```

### 2. Enhanced Click Tracking Handler

**File:** `src/app/api/track/click/[token]/route.ts` (Updated)

```typescript
import { checkUserExists, createAutoAccount, sendPasswordSetupEmail, linkOrderToUser } from '@/lib/actions/auth/account-auto-creation'
import { sendAccountNotificationEmail } from '@/lib/email/account-emails'

// ... existing imports and code ...

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const { searchParams } = new URL(request.url)
  const redirectUrl = searchParams.get('redirect')

  // 1. Validate token and get order
  const order = await getOrderByToken(token)
  if (!order) {
    return new Response('Invalid token', { status: 404 })
  }

  // 2. Check if this is the first click
  const isFirstClick = !order.clicked_at

  if (isFirstClick) {
    // Mark as clicked
    await markLinkClicked(token)

    // **NEW - Automatic Account Creation Logic**
    const userExists = await checkUserExists(order.customer_email)

    if (!userExists) {
      // Create new account for first-time lead magnet user
      try {
        const product = await getProductById(order.product_id)
        const site = await getSiteById(order.site_id)

        const newUser = await createAutoAccount({
          email: order.customer_email,
          siteId: order.site_id,
          productId: order.product_id,
          productSlug: product.slug,
        })

        // Link order to newly created user
        await linkOrderToUser(order.id, newUser.id)

        // Send welcome email with password setup link
        await sendAccountNotificationEmail({
          to: order.customer_email,
          type: 'new_account',
          productName: product.title,
          siteUrl: site.custom_domain || `${site.subdomain}.yourdomain.com`,
        })

        await sendPasswordSetupEmail(
          order.customer_email,
          site.custom_domain || `${site.subdomain}.yourdomain.com`
        )

      } catch (error) {
        console.error('Account creation failed:', error)
        // Don't fail the entire flow if account creation fails
        // User still gets their content, just no account
      }
    } else {
      // Existing user - link order to their account
      try {
        const existingUser = await getUserByEmail(order.customer_email)
        await linkOrderToUser(order.id, existingUser.id)

        // Send notification about new lead magnet
        const product = await getProductById(order.product_id)
        const site = await getSiteById(order.site_id)

        await sendAccountNotificationEmail({
          to: order.customer_email,
          type: 'existing_account',
          productName: product.title,
          siteUrl: site.custom_domain || `${site.subdomain}.yourdomain.com`,
        })

      } catch (error) {
        console.error('Failed to link order to existing user:', error)
        // Continue - user still gets content
      }
    }

    // Add to Flodesk (existing functionality)
    if (!order.flodesk_added_at) {
      const flodeskConfig = await getFlodeskConfig(order.site_id)
      if (flodeskConfig?.is_enabled) {
        const product = await getProductById(order.product_id)
        const tag = `lead-magnet-${product.slug}`

        await flodeskService.addSubscriber(flodeskConfig.config, {
          email: order.customer_email,
          segmentId: flodeskConfig.config.segmentId,
          tags: [tag],
        })

        await markFlodeskAdded(order.id)
      }
    }
  } else {
    // Subsequent clicks - just increment counter
    await incrementClickCount(token)
  }

  // 3. Redirect to destination or show content
  if (redirectUrl) {
    return Response.redirect(redirectUrl, 302)
  }

  // Simple HTML page if no redirect URL
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Opening Content...</title>
        <meta http-equiv="refresh" content="3;url=/" />
      </head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>Opening your content...</h1>
        <p>You'll be redirected shortly.</p>
      </body>
    </html>
    `,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
```

### 3. Email Templates for Account Notifications

**File:** `src/lib/email/account-emails.ts`

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface AccountEmailParams {
  to: string
  type: 'new_account' | 'existing_account'
  productName: string
  siteUrl: string
}

export async function sendAccountNotificationEmail(params: AccountEmailParams) {
  const { to, type, productName, siteUrl } = params

  if (type === 'new_account') {
    // Email for newly created accounts
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome! Your Account is Ready</h1>
            </div>
            <div class="content">
              <p>Great news! We've created an account for you to access your lead magnet: <strong>${productName}</strong></p>

              <p><strong>What's next?</strong></p>
              <ul>
                <li>Check your inbox for a password setup link</li>
                <li>Set your password to access your account anytime</li>
                <li>Log in to view all your lead magnets in one place</li>
              </ul>

              <p style="text-align: center;">
                <a href="${siteUrl}/login" class="button">Go to Login Page</a>
              </p>

              <p><strong>Why did we create an account?</strong><br/>
              So you can access your lead magnets anytime, even if you lose the email. Your content is always safe in your account!</p>
            </div>
            <div class="footer">
              <p>Need help? Reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `

    await resend.emails.send({
      from: process.env.DEFAULT_FROM_EMAIL!,
      to,
      subject: `🎉 Your Account is Ready - ${productName}`,
      html,
    })

  } else if (type === 'existing_account') {
    // Email for existing accounts
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📦 New Lead Magnet Added!</h1>
            </div>
            <div class="content">
              <p>Good news! <strong>${productName}</strong> has been added to your account.</p>

              <p>Log in to your account to access this and all your other lead magnets in one convenient place.</p>

              <p style="text-align: center;">
                <a href="${siteUrl}/login" class="button">Log In to Your Account</a>
              </p>

              <p><strong>Your lead magnets are always accessible</strong><br/>
              Even if you lose this email, you can always log in to access your content.</p>
            </div>
            <div class="footer">
              <p>Need help? Reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `

    await resend.emails.send({
      from: process.env.DEFAULT_FROM_EMAIL!,
      to,
      subject: `📦 New Lead Magnet Added - ${productName}`,
      html,
    })
  }
}
```

---

## Password Management Strategy

### Random Password + Magic Link (Chosen Approach)

**Implementation:**

```typescript
// Generate cryptographically secure random password
const tempPassword = randomBytes(32).toString('base64url')

// Create account with temporary password
await supabaseAdmin.auth.admin.createUser({
  email: userEmail,
  password: tempPassword,
  email_confirm: true,  // Skip confirmation (email already verified)
})

// Immediately send magic link to set custom password
await supabaseAdmin.auth.resetPasswordForEmail(userEmail, {
  redirectTo: `${siteUrl}/auth/set-password`,
})
```

**Why this approach:**

✅ **Security**: Account protected by strong password from day one
✅ **Flexibility**: User can log in via magic link OR password later
✅ **Supabase Native**: Works with standard Supabase auth flow
✅ **User Choice**: User sets their own memorable password
✅ **Recovery Options**: Password reset flow built-in

**User Experience:**

1. User clicks link in lead magnet email
2. Account created automatically (background)
3. Receives TWO emails:
   - **Email 1**: "Your account is ready! Click to set your password"
   - **Email 2**: Magic link from Supabase to set password
4. User clicks magic link → Redirected to `/auth/set-password` page
5. User enters new password → Account fully activated

**Alternative considered (Passwordless):** Magic link only initially. Rejected because:
- ❌ Less secure (no password protection)
- ❌ Requires magic link support everywhere
- ❌ User locked out if they lose email access
- ❌ More complex to implement

---

## Token Storage Architecture

### Why Tokens Stay in product_orders Table

**Decision:** Keep `access_token` in `product_orders` table (current location)

**Reasoning:**

1. **Tokens are per-order, not per-user**
   - User can have multiple orders = multiple tokens
   - Each order needs its own tracking (click count, engagement)
   - One-to-one relationship: order ↔ token

2. **Performance**
   - Indexed VARCHAR column faster than JSON search
   - Direct lookup: `SELECT * FROM product_orders WHERE access_token = ?`
   - No need to scan all users' metadata

3. **Data integrity**
   - Foreign key relationship: `product_orders.user_id → auth.users.id`
   - Clear ownership: Order belongs to user
   - Easy queries: "Get all orders for user X"

4. **Scalability**
   - One query to get order + token info
   - No complex JSON parsing
   - Easier to add token expiration logic later

**Relationship Diagram:**

```
auth.users (Supabase managed)
  ├─ id (UUID)
  ├─ email
  ├─ user_metadata (JSON) - stores account creation context
  └─ raw_app_meta_data (JSON) - stores role (admin or empty)

           ↑ (user_id foreign key)
           │
product_orders (Custom table)
  ├─ id (UUID)
  ├─ user_id (UUID) ← Links to auth.users.id
  ├─ site_id (UUID) ← Which site order came from
  ├─ product_id (UUID)
  ├─ customer_email (VARCHAR)
  ├─ access_token (VARCHAR, UNIQUE) ← Token stays here!
  ├─ clicked_at (TIMESTAMP)
  ├─ click_count (INTEGER)
  └─ metadata (JSONB)
```

**What gets stored in user_metadata:**

```json
{
  "created_from": "lead_magnet",
  "first_lead_magnet_site_id": "uuid",
  "first_lead_magnet_product_id": "uuid",
  "lead_magnet_count": 3,
  "sites_interacted_with": ["site-uuid-1"]
}
```

**NOT stored in user_metadata:** Tokens, order IDs, email content, tracking data

---

## Security Considerations - Phase 2

### 1. Account Creation Security

**Protections implemented:**

- ✅ Email verification via click (user must click link to trigger account creation)
- ✅ Cryptographically secure random passwords (32 bytes, base64url encoded)
- ✅ Auto-confirmed email (skip redundant confirmation since click = verification)
- ✅ Rate limiting on token clicks (prevent spam account creation)
- ✅ No account enumeration (don't reveal if email exists)

**Rate limiting strategy:**

```typescript
// In /api/track/click/[token]/route.ts
// Limit account creation attempts per IP
const MAX_ACCOUNT_CREATIONS_PER_IP_PER_HOUR = 5

// Check Redis or database for IP-based rate limiting
const creationCount = await getAccountCreationCount(ipAddress, 'hour')
if (creationCount >= MAX_ACCOUNT_CREATIONS_PER_IP_PER_HOUR) {
  // Still allow content access, just skip account creation
  console.warn(`Rate limit exceeded for IP ${ipAddress}`)
}
```

### 2. Admin Privilege Separation

**How lead magnet users CANNOT become admins:**

1. **RLS policies check metadata:**
   ```sql
   CREATE POLICY "Admin full access" ON themes
   FOR ALL USING (
     EXISTS (
       SELECT 1 FROM auth.users
       WHERE auth.users.id = auth.uid()
       AND auth.users.raw_app_meta_data->>'role' = 'admin'
     )
   );
   ```

2. **No application code to set admin role:**
   - Admin role must be set via Supabase dashboard
   - Or via service role API (not exposed to users)
   - `createAutoAccount()` does NOT set role field

3. **Metadata separation:**
   - `user_metadata`: User-editable (profile info, preferences)
   - `raw_app_meta_data`: System-only (roles, permissions) - users CANNOT edit this

**Verification checklist:**

- [ ] Lead magnet users created without `role` in `raw_app_meta_data`
- [ ] RLS policies block non-admin access to admin tables
- [ ] No API endpoints allow setting admin role
- [ ] Admin layout checks authentication (via Supabase auth)
- [ ] Admin dashboard inaccessible to regular users (RLS blocks data)

### 3. Token Security (No Changes)

Token security remains the same as Phase 1:

- 32-byte cryptographically secure random tokens
- Unique constraint on `access_token` column
- No expiration (user can click anytime) - add if needed
- Click count tracking to detect suspicious activity
- Rate limiting on click endpoint

---

## Future Dashboard Feature (Not Implemented Yet)

### User Dashboard Concept

**Route:** `/dashboard/my-lead-magnets`

**Purpose:** Allow users to view and re-access all their lead magnets

**Features:**

```typescript
// Example component structure
interface LeadMagnetDashboard {
  user: User
  orders: ProductOrder[]
}

function MyLeadMagnetsPage() {
  const orders = await getUserOrders(userId)

  return (
    <div>
      <h1>My Lead Magnets</h1>

      {orders.map(order => (
        <div key={order.id}>
          <h2>{order.product.title}</h2>
          <p>From: {order.site.name}</p>
          <p>Received: {order.created_at}</p>
          <a href={`/api/track/click/${order.access_token}`}>
            Access Content
          </a>
        </div>
      ))}
    </div>
  )
}
```

**Benefits:**

- User can access lead magnets without searching emails
- Shows all lead magnets across multiple sites
- Allows re-downloading content
- Provides engagement analytics (clicks, date received)

**Not included in Phase 2** - This is a future enhancement

---

## Implementation Checklist - Phase 2

### Database

- [ ] Create migration `066_add_user_id_to_product_orders.sql`
- [ ] Add `user_id` column to `product_orders` table
- [ ] Add indexes for performance (`user_id`, `user_id + site_id`)
- [ ] Test foreign key relationship works correctly
- [ ] Verify ON DELETE SET NULL behavior

### Auth Functions

- [ ] Create `src/lib/actions/auth/account-auto-creation.ts`
- [ ] Implement `checkUserExists(email)`
- [ ] Implement `createAutoAccount(params)`
- [ ] Implement `sendPasswordSetupEmail(email, siteUrl)`
- [ ] Implement `linkOrderToUser(orderId, userId)`
- [ ] Test account creation with Supabase admin client

### Email Templates

- [ ] Create `src/lib/email/account-emails.ts`
- [ ] Design "new account" email template (HTML + plain text)
- [ ] Design "existing account" email template
- [ ] Test email delivery via Resend
- [ ] Ensure emails are mobile-responsive

### Click Tracking Enhancement

- [ ] Update `/api/track/click/[token]/route.ts`
- [ ] Add account creation logic on first click
- [ ] Implement user existence check
- [ ] Add error handling (don't fail content delivery if account creation fails)
- [ ] Add rate limiting to prevent abuse
- [ ] Test both new user and existing user flows

### Set Password Page

- [ ] Create `/app/auth/set-password/page.tsx`
- [ ] Build form for user to enter new password
- [ ] Validate password strength (min 8 chars, etc.)
- [ ] Call Supabase password update API
- [ ] Redirect to dashboard after success
- [ ] Handle expired magic links gracefully

### Testing

- [ ] **New user flow**: Submit email → Click link → Account created → Set password → Login
- [ ] **Existing user flow**: Submit email → Click link → Order linked → Notification sent
- [ ] **Email verification**: Confirm two emails sent for new users (welcome + magic link)
- [ ] **Token security**: Verify tokens remain in product_orders table
- [ ] **Admin separation**: Verify lead magnet users CANNOT access /admin
- [ ] **RLS policies**: Verify users can only see their own orders
- [ ] **Error handling**: Test account creation failure doesn't break content delivery
- [ ] **Rate limiting**: Test IP-based rate limiting works

### Documentation

- [ ] Update this document with implementation notes
- [ ] Document user flows (new vs existing)
- [ ] Add architecture diagrams
- [ ] Document security measures
- [ ] Create troubleshooting guide

---

## Testing Plan - Phase 2

### Manual Testing Scenarios

**Scenario 1: First-time Lead Magnet User (Happy Path)**

1. User visits product page (not logged in, never used system before)
2. Enters email in lead magnet form
3. Submits form → Receives confirmation
4. Checks email → Sees lead magnet content email
5. Clicks any link in email
6. **Expected:**
   - Redirected to content
   - Account created in background
   - Receives "Welcome! Account created" email
   - Receives Supabase magic link email to set password
7. Clicks magic link → Set password page
8. Sets password → Can log in
9. Views dashboard → Sees lead magnet listed

**Scenario 2: Existing User Gets New Lead Magnet**

1. User already has account from previous lead magnet
2. Visits different product page
3. Enters same email address
4. Submits form → Receives lead magnet email
5. Clicks link in email
6. **Expected:**
   - Redirected to content
   - Order linked to existing account (no new account created)
   - Receives "New lead magnet added" email
   - Can log in and see both lead magnets in dashboard

**Scenario 3: Account Creation Failure (Graceful Degradation)**

1. User submits email for lead magnet
2. Clicks link in email
3. Account creation fails (e.g., Supabase API error)
4. **Expected:**
   - User STILL gets access to content (primary goal achieved)
   - Error logged server-side
   - Content delivery not interrupted
   - User can manually create account later if needed

**Scenario 4: Rate Limiting**

1. Attacker tries to create many accounts from same IP
2. Submits 10+ lead magnet signups with different emails
3. Clicks all links rapidly
4. **Expected:**
   - First 5 account creations succeed
   - Subsequent attempts logged but skipped
   - Content delivery continues (not blocked)
   - Rate limit resets after 1 hour

---

## Rollout Strategy - Phase 2

### Step-by-Step Deployment

**Step 1: Database Migration (Non-Breaking)**

```bash
# Run migration to add user_id column
supabase migration up 066_add_user_id_to_product_orders.sql

# Verify migration succeeded
psql -d database -c "SELECT column_name FROM information_schema.columns WHERE table_name='product_orders';"
# Should include 'user_id'
```

**Step 2: Deploy Auth Functions (No User Impact)**

- Deploy `account-auto-creation.ts` helper functions
- Deploy `account-emails.ts` email templates
- No visible changes to users yet

**Step 3: Deploy Click Tracking Enhancement (Feature Activation)**

- Deploy updated `/api/track/click/[token]/route.ts`
- **Feature is now LIVE** - new clicks will create accounts
- Existing tokens continue to work (backward compatible)

**Step 4: Deploy Set Password Page**

- Deploy `/app/auth/set-password/page.tsx`
- Users can now set passwords via magic links

**Step 5: Monitor & Iterate**

- Monitor account creation logs
- Track email delivery rates
- Watch for errors in account creation
- Adjust rate limits if needed
- Gather user feedback

### Backward Compatibility

✅ **Existing tokens continue to work**
- Old orders (before Phase 2) don't have `user_id` - that's OK (nullable column)
- Old tokens still track clicks and add to Flodesk
- No breaking changes to existing functionality

✅ **Existing users unaffected**
- Users who manually signed up before Phase 2 continue to work
- Admin users unaffected
- RLS policies remain the same

✅ **Gradual rollout possible**
- Can enable account creation per-site via feature flag
- Can disable if issues arise (just remove account creation code from click handler)

---

## Cost & Performance Implications

### Supabase Usage

**Additional auth.users rows:**
- Each lead magnet signup now creates 1 auth user
- Supabase free tier: 50,000 MAU (Monthly Active Users)
- Estimate: 100-500 new users/month from lead magnets
- Well within free tier limits

**Additional database queries:**
- 1 extra SELECT (check user exists): ~1ms
- 1 extra INSERT (create user): ~5ms
- 1 extra UPDATE (link order): ~2ms
- **Total latency added: ~8ms per first click** - negligible

### Email Sending Costs

**Resend usage increase:**
- Each new user: +2 emails (welcome + magic link)
- Each existing user: +1 email (notification)
- Estimate: If 100 new lead magnets/month:
  - 80 new users × 2 emails = 160 emails
  - 20 existing users × 1 email = 20 emails
  - **Total: +180 emails/month**
- Resend free tier: 3,000 emails/month - still plenty of room

### Performance Impact

**Click tracking endpoint:**
- Before Phase 2: ~50ms avg response time
- After Phase 2: ~60ms avg response time (due to account creation)
- **+10ms latency** - acceptable for email click tracking
- Redirect still happens quickly (no user-facing delay)

**Database load:**
- Negligible increase (3 extra queries per first click)
- Indexes ensure fast lookups
- No N+1 query issues

---

## Conclusion - Phase 2

This Phase 2 enhancement transforms the lead magnet system from a simple email delivery mechanism into a full user acquisition and retention system.

### Key Benefits

✅ **Seamless user onboarding** - Accounts created without friction
✅ **Email verification built-in** - Click = verified email
✅ **Secure password management** - Random passwords + magic links
✅ **User flow differentiation** - New vs existing users get relevant emails
✅ **Token security maintained** - Tokens remain in proper location
✅ **No admin conflicts** - Complete separation of privileges
✅ **Backward compatible** - Existing functionality unchanged
✅ **Scalable architecture** - Ready for user dashboard and advanced features

### What's Next (Phase 3)

**Phase 3 will implement a User Dashboard Builder** - a global template system for all end users to access their lead magnets, orders, and account settings. See Phase 3 documentation below.

**Phase 2 lays the foundation for a complete user lifecycle management system while maintaining simplicity and security.**

---

## Phase 3: User Dashboard Builder (Global Template System)

### Overview

Create a user-facing dashboard where lead magnet recipients can view their content, manage their account, and track their activity. This dashboard uses a **global template approach** - admins design one dashboard layout that all users see, with personalized data per user.

### Goals

1. **Global Template**: Admin designs ONE dashboard template at `/admin/user-dashboard-builder`
2. **User Access**: All users see the same layout at `/dashboard` with their own data
3. **Reuse Architecture**: Duplicate proven pages builder patterns
4. **Lead Magnet Integration**: Display user's product_orders with access links
5. **Future-Proof**: Leave room for Tenant Dashboard (site owner level) later

---

## Three-Tier Dashboard Architecture

### Platform Dashboard Levels

1. **Admin Dashboard** (`/admin`)
   - Platform-level administrators
   - Manage all sites, themes, users, system settings
   - Has `role: 'admin'` in `raw_app_meta_data`
   - Full access to everything

2. **Tenant Dashboard** (`/tenant-dashboard`) - **Future Phase 4**
   - Site owner/manager level
   - Manage their own site(s), products, orders, analytics
   - Higher permissions than regular users
   - Can configure integrations, view revenue, etc.

3. **User Dashboard** (`/dashboard`) - **Phase 3 (This Implementation)**
   - Regular end-user level
   - Lead magnet recipients, customers
   - View their own lead magnets, orders, account settings
   - Read-only access to their own data

### Naming Conventions

**Database Tables:**
- `user_dashboard_pages` - Global template pages (no per-user copies)
- `user_dashboard_settings` - Global sidebar and theme config
- `tenant_dashboard_pages` - Future: Tenant dashboard template
- `tenant_dashboard_settings` - Future: Tenant dashboard config

**Routes:**
- `/dashboard` - User dashboard (end users)
- `/admin/user-dashboard-builder` - Template editor (admins only)
- `/tenant-dashboard` - Future: Tenant dashboard
- `/admin/tenant-dashboard-builder` - Future: Tenant template editor

---

## Database Schema - Phase 3

### Global Template Architecture

**Key Design Decision:** Dashboard pages are a **global template**, not per-user copies.

**Why Global Template:**
- ✅ **Simplicity**: One template, not thousands of copies
- ✅ **Performance**: Single query loads template for all users
- ✅ **Consistency**: All users see same professional dashboard
- ✅ **Easy Updates**: Admin changes template once, all users see it
- ✅ **Scalability**: Database size doesn't grow with user count

### 1. User Dashboard Pages Table

```sql
-- Migration: 0XX_create_user_dashboard_system.sql

-- Global user dashboard pages (NOT per-user, shared template)
CREATE TABLE user_dashboard_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,  -- NO user_id, globally unique slugs
    icon VARCHAR(50),  -- Icon for sidebar menu
    is_default BOOLEAN DEFAULT false,  -- Default page when accessing /dashboard
    is_published BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    content_blocks JSONB DEFAULT '{}',  -- Same pattern as pages.content_blocks
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_dashboard_pages_slug ON user_dashboard_pages(slug);
CREATE INDEX idx_user_dashboard_pages_order ON user_dashboard_pages(display_order);
CREATE INDEX idx_user_dashboard_pages_published ON user_dashboard_pages(is_published);
```

**Key Differences from `pages` Table:**
- ❌ **NO `site_id`** - Not site-scoped, global template
- ❌ **NO `user_id`** - Not per-user, shared by all
- ✅ **Global slugs** - Unique across all users (e.g., "overview", "lead-magnets")
- ✅ **Icon field** - For dashboard sidebar navigation

### 2. User Dashboard Settings Table

```sql
-- Global user dashboard settings (sidebar config, theme)
CREATE TABLE user_dashboard_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sidebar_config JSONB DEFAULT '{}',  -- Sidebar navigation structure
    theme_settings JSONB DEFAULT '{}',  -- Theme colors, layout preferences
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one settings row exists (singleton pattern)
CREATE UNIQUE INDEX idx_single_user_dashboard_settings ON user_dashboard_settings ((id IS NOT NULL));
```

**sidebar_config Structure:**
```json
{
  "items": [
    {"label": "Overview", "slug": "overview", "icon": "home"},
    {"label": "My Lead Magnets", "slug": "lead-magnets", "icon": "gift"},
    {"label": "Settings", "slug": "settings", "icon": "settings"}
  ]
}
```

**theme_settings Structure:**
```json
{
  "primaryColor": "#4F46E5",
  "sidebarWidth": "250px",
  "sidebarPosition": "left"
}
```

### 3. RLS Policies

```sql
-- Admins can manage user dashboard template
CREATE POLICY "Admins manage user dashboard pages" ON user_dashboard_pages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- All authenticated users can view dashboard pages (read-only)
CREATE POLICY "Users view dashboard pages" ON user_dashboard_pages
    FOR SELECT USING (auth.uid() IS NOT NULL AND is_published = true);

-- Admins manage dashboard settings
CREATE POLICY "Admins manage dashboard settings" ON user_dashboard_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- All authenticated users can view dashboard settings
CREATE POLICY "Users view dashboard settings" ON user_dashboard_settings
    FOR SELECT USING (auth.uid() IS NOT NULL);
```

**Security Model:**
- **Admins**: Full CRUD on template (create, read, update, delete)
- **Users**: Read-only on template (SELECT only)
- **User Data**: Users access their own `product_orders` via separate query

---

## Default Dashboard Template

### Seed Data Migration

```sql
-- Migration: 0XX_seed_default_user_dashboard.sql

-- Create default dashboard pages
INSERT INTO user_dashboard_pages (title, slug, icon, is_default, display_order, content_blocks) VALUES
(
    'Overview',
    'overview',
    'home',
    true,  -- Default landing page
    0,
    '{
        "block-1": {
            "type": "dashboard_stats",
            "metrics": ["total_lead_magnets", "sites_interacted", "account_age"],
            "layout": "grid"
        },
        "block-2": {
            "type": "dashboard_rich_text",
            "content": "<h2>Welcome to Your Dashboard</h2><p>Access all your lead magnets and manage your account from here.</p>"
        }
    }'
),
(
    'My Lead Magnets',
    'lead-magnets',
    'gift',
    false,
    1,
    '{
        "block-1": {
            "type": "lead_magnet_list",
            "layout": "cards",
            "showSite": true,
            "showDate": true,
            "showClickCount": true,
            "sortBy": "created_at",
            "sortOrder": "desc"
        }
    }'
),
(
    'Account Settings',
    'settings',
    'settings',
    false,
    2,
    '{
        "block-1": {
            "type": "account_info",
            "showEmail": true,
            "showCreatedAt": true,
            "allowPasswordChange": true
        }
    }'
);

-- Create default sidebar config (singleton row)
INSERT INTO user_dashboard_settings (sidebar_config, theme_settings) VALUES (
    '{
        "items": [
            {"label": "Overview", "slug": "overview", "icon": "home"},
            {"label": "My Lead Magnets", "slug": "lead-magnets", "icon": "gift"},
            {"label": "Settings", "slug": "settings", "icon": "settings"}
        ]
    }',
    '{
        "primaryColor": "#4F46E5",
        "sidebarWidth": "250px",
        "sidebarPosition": "left"
    }'
);
```

---

## User Dashboard Block Types

### Admin-Configurable Blocks

These blocks are configured by admins in the template, but display user-specific data:

#### 1. Dashboard Sidebar Block (Protected)

**Type:** `dashboard_sidebar`

**Purpose:** Configure global sidebar navigation

**Admin Configuration:**
```json
{
  "type": "dashboard_sidebar",
  "items": [
    {"label": "Overview", "slug": "overview", "icon": "home"},
    {"label": "My Lead Magnets", "slug": "lead-magnets", "icon": "gift"},
    {"label": "Settings", "slug": "settings", "icon": "settings"}
  ],
  "showUserProfile": true,
  "showLogout": true
}
```

**User View:** Sidebar rendered with links to dashboard pages

**Protection:** Cannot be deleted (like navigation/footer in page builder)

#### 2. Lead Magnet List Block

**Type:** `lead_magnet_list`

**Purpose:** Display user's lead magnets from `product_orders`

**Admin Configuration:**
```json
{
  "type": "lead_magnet_list",
  "layout": "cards",  // "cards" | "list" | "table"
  "showSite": true,
  "showDate": true,
  "showClickCount": true,
  "sortBy": "created_at",
  "sortOrder": "desc",
  "emptyMessage": "You haven't collected any lead magnets yet!"
}
```

**User View:**
```typescript
// Queries: SELECT * FROM product_orders WHERE user_id = current_user
// Displays each product_order as a card/row with:
- Product title
- Site name (if showSite)
- Received date (if showDate)
- Click count (if showClickCount)
- Access button (links to /api/track/click/[token])
```

**Data Source:** `product_orders` table filtered by current user

#### 3. Dashboard Stats Block

**Type:** `dashboard_stats`

**Purpose:** Display user statistics

**Admin Configuration:**
```json
{
  "type": "dashboard_stats",
  "metrics": ["total_lead_magnets", "sites_interacted", "account_age"],
  "layout": "grid",  // "grid" | "inline" | "vertical"
  "showIcons": true
}
```

**Available Metrics:**
- `total_lead_magnets` - Count of user's product_orders
- `sites_interacted` - Count of unique sites user collected from
- `account_age` - Days since account created
- `total_clicks` - Sum of click_count across orders
- `last_activity` - Most recent clicked_at date

**User View:** Stat cards with numbers calculated from user's data

#### 4. Dashboard Rich Text Block

**Type:** `dashboard_rich_text`

**Purpose:** Welcome messages, instructions, announcements

**Admin Configuration:**
```json
{
  "type": "dashboard_rich_text",
  "content": "<h2>Welcome!</h2><p>Manage your lead magnets here.</p>",
  "alignment": "left",
  "padding": "medium"
}
```

**User View:** Static HTML content (same for all users)

**Reuse:** Same as PageRichTextEditorBlock from page builder

#### 5. Account Info Block

**Type:** `account_info`

**Purpose:** Display and edit user account information

**Admin Configuration:**
```json
{
  "type": "account_info",
  "showEmail": true,
  "showCreatedAt": true,
  "allowPasswordChange": true,
  "allowEmailChange": false
}
```

**User View:**
- Email address (read-only or editable)
- Account created date
- Change password button
- Profile settings

**User Actions:** Edit their own auth.users data

---

## Admin Builder UI

### Route: `/admin/user-dashboard-builder`

**Access Control:** Admins only (check `raw_app_meta_data->>'role' = 'admin'`)

### Component Architecture (Reuse Page Builder Pattern)

**Main Builder Page:** `src/app/admin/user-dashboard-builder/page.tsx`

**Structure:** Same 3-panel layout as page builder
1. **Left Panel:** BlockPropertiesPanel - Edit selected block
2. **Middle Panel:** BlockListPanel - Drag-drop reorder, select, delete
3. **Right Panel:** BlockTypesPanel - Add new blocks

**Components to Create:**

1. **UserDashboardBuilderHeader.tsx**
   - Page selector dropdown (Overview, My Lead Magnets, Settings)
   - Save button with status
   - Preview as User button (see dashboard as regular user)
   - Add New Page button

2. **BlockListPanel.tsx** (reuse pattern)
   - Drag-and-drop reordering using `@dnd-kit`
   - Protected blocks (sidebar) cannot be deleted/reordered
   - Delete confirmations
   - Block selection

3. **BlockPropertiesPanel.tsx** (reuse pattern)
   - Load user-dashboard-specific block editors
   - Update callbacks
   - Preview mode

4. **BlockTypesPanel.tsx** (new blocks)
   - Add buttons for: Sidebar, Lead Magnet List, Stats, Rich Text, Account Info
   - Block descriptions
   - Icon for each type

### Block Editors (Admin Components)

**Create in `src/components/admin/user-dashboard-builder/blocks/`:**

1. **UserDashboardSidebarBlock.tsx**
   - Add/remove/reorder sidebar items
   - Icon picker for each item
   - Link to page slug
   - Toggle user profile section
   - Toggle logout button

2. **UserDashboardLeadMagnetListBlock.tsx**
   - Layout selector (cards, list, table)
   - Show/hide fields checkboxes
   - Sort options (date, title, site)
   - Empty state message editor
   - Preview with mock data

3. **UserDashboardStatsBlock.tsx**
   - Select which metrics to display
   - Layout options (grid, inline, vertical)
   - Icon toggle
   - Label customization

4. **UserDashboardRichTextBlock.tsx**
   - TipTap rich text editor (reuse from page builder)
   - Alignment options
   - Padding options

5. **UserDashboardAccountInfoBlock.tsx**
   - Toggle which fields to show
   - Enable/disable password change
   - Enable/disable email change

---

## Custom Hooks

### For Admin Builder

**useUserDashboardData** (`src/hooks/useUserDashboardData.ts`)
```typescript
export function useUserDashboardData() {
  // Load all user_dashboard_pages (no user filtering)
  // Load user_dashboard_settings (singleton row)
  // Convert JSON content_blocks to array format
  // Inject sidebar block into array (display_order: -1)
  return { pages, settings, isLoading, error }
}
```

**useUserDashboardBuilder** (`src/hooks/useUserDashboardBuilder.ts`)
```typescript
export function useUserDashboardBuilder() {
  // Add/delete/reorder/update blocks
  // Save blocks to user_dashboard_pages.content_blocks
  // Save sidebar to user_dashboard_settings.sidebar_config
  // Optimistic updates
  return { addBlock, deleteBlock, reorderBlocks, updateBlock, save, isSaving }
}
```

### For User-Facing Dashboard

**useUserDashboard** (`src/hooks/useUserDashboard.ts`)
```typescript
export function useUserDashboard() {
  // Load global dashboard template (pages + settings)
  // Load user-specific data (product_orders)
  // Combine template with user data
  return { pages, sidebar, userData, isLoading }
}
```

---

## Server Actions

### Admin Actions (Template Management)

**File:** `src/lib/actions/user-dashboard/user-dashboard-page-actions.ts`

```typescript
// All functions check for admin role first

export async function getUserDashboardPages(): Promise<UserDashboardPage[]>
export async function getUserDashboardPageBySlug(slug: string): Promise<UserDashboardPage | null>
export async function createUserDashboardPage(params: CreatePageParams): Promise<UserDashboardPage>
export async function updateUserDashboardPage(pageId: string, updates: UpdateParams): Promise<void>
export async function deleteUserDashboardPage(pageId: string): Promise<void>
export async function updateUserDashboardBlocks(pageId: string, contentBlocks: any): Promise<void>
export async function reorderUserDashboardPages(pageIds: string[]): Promise<void>
```

**File:** `src/lib/actions/user-dashboard/user-dashboard-settings-actions.ts`

```typescript
export async function getUserDashboardSettings(): Promise<UserDashboardSettings>
export async function updateUserDashboardSidebar(sidebarConfig: any): Promise<void>
export async function updateUserDashboardTheme(themeSettings: any): Promise<void>
```

### User Actions (Read Template + Own Data)

**File:** `src/lib/actions/user-dashboard/user-dashboard-actions.ts`

```typescript
// Regular users - read template + their data

export async function getDashboardForUser(): Promise<UserDashboardData> {
  // Load global template (pages + settings)
  // Load user's product_orders
  // Calculate user stats
  // Combine and return
}

export async function getUserLeadMagnets(): Promise<LeadMagnet[]> {
  // Query product_orders WHERE user_id = current_user
  // Join with products and sites for display
  // Return array of lead magnet data
}

export async function getUserStats(): Promise<UserStats> {
  // Calculate stats from user's product_orders
  // Return aggregated metrics
}
```

---

## Frontend User Dashboard

### Route Structure

**Base Route:** `/dashboard`

**Dynamic Pages:** `/dashboard/[slug]`

**Default Redirect:** `/dashboard` → `/dashboard/overview`

### Dashboard Layout

**File:** `src/app/dashboard/layout.tsx`

```typescript
export default async function DashboardLayout({ children }) {
  // Require authentication (redirect to /login if not logged in)
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirect=/dashboard')

  // Load global sidebar config
  const settings = await getUserDashboardSettings()

  return (
    <div className="dashboard-layout">
      <UserDashboardSidebar config={settings.sidebar_config} />
      <main className="dashboard-content">
        {children}
      </main>
    </div>
  )
}
```

### Dashboard Page Renderer

**File:** `src/app/dashboard/[slug]/page.tsx`

```typescript
export default async function DashboardPage({ params }) {
  const { slug } = params

  // Load global dashboard page template by slug
  const dashboardPage = await getUserDashboardPageBySlug(slug)
  if (!dashboardPage) notFound()

  // Load current user's data
  const userData = await getDashboardForUser()

  return (
    <div>
      <h1>{dashboardPage.title}</h1>
      <UserDashboardBlockRenderer
        blocks={dashboardPage.content_blocks}
        userData={userData}
      />
    </div>
  )
}
```

### Frontend Components

**Create in `src/components/frontend/user-dashboard/`:**

1. **UserDashboardSidebar.tsx**
   - Render sidebar from global config
   - Highlight active page
   - User profile section (avatar, name, email)
   - Logout button

2. **UserDashboardBlockRenderer.tsx**
   - Main renderer (like PageBlockRenderer)
   - Routes block type to appropriate component
   - Passes user context to each block

3. **UserDashboardLeadMagnetList.tsx**
   - Queries user's product_orders
   - Renders in configured layout (cards/list/table)
   - Access links using tokens
   - Empty state if no lead magnets

4. **UserDashboardStats.tsx**
   - Displays user statistics
   - Calculated from user's product_orders
   - Formatted as configured by admin

5. **UserDashboardAccountInfo.tsx**
   - Shows current user's info
   - Edit profile modal
   - Change password functionality

---

## Integration with Lead Magnet System

### Account Creation Flow Update

**In `/api/track/click/[token]/route.ts` (from Phase 2):**

No changes needed! Dashboard is a global template, so new users automatically see it when they log in.

### Email Updates

**Welcome email for new accounts** (from Phase 2):
```html
<p>Your account is ready! Log in to access your dashboard.</p>
<a href="${siteUrl}/dashboard/lead-magnets">View Your Lead Magnets</a>
```

**Existing user notification** (from Phase 2):
```html
<p>A new lead magnet has been added to your account.</p>
<a href="${siteUrl}/dashboard/lead-magnets">Go to Dashboard</a>
```

### Redirect After Login

**In login flow:**
```typescript
// After successful login, redirect to dashboard
if (redirectUrl) {
  redirect(redirectUrl)
} else {
  redirect('/dashboard')  // Default to dashboard overview
}
```

---

## Data Flow Diagram

### Admin Editing Template

```
Admin User
  ↓
/admin/user-dashboard-builder
  ↓
Edit blocks, sidebar, theme
  ↓
Save to user_dashboard_pages.content_blocks
Save to user_dashboard_settings.sidebar_config
  ↓
Template updated globally
  ↓
All users see changes immediately
```

### User Viewing Dashboard

```
Regular User
  ↓
/dashboard (redirects to /dashboard/overview)
  ↓
Load global template (user_dashboard_pages + settings)
Load user data (product_orders WHERE user_id = current_user)
  ↓
Render template with user's data
  ↓
User sees personalized dashboard
```

---

## Database Size Comparison

### Global Template Approach (Recommended)

**Template Data:**
- 3-5 rows in `user_dashboard_pages` (overview, lead-magnets, settings, etc.)
- 1 row in `user_dashboard_settings` (singleton)
- **Total: ~5 rows regardless of user count**

**User Data:**
- N rows in `product_orders` (1 per lead magnet per user)
- **Grows with actual user activity, not with user count**

**Example with 10,000 users:**
- Template: 5 rows (constant)
- Orders: ~30,000 rows (avg 3 lead magnets per user)
- **Total: 30,005 rows**

### Per-User Approach (Alternative - Not Recommended)

**If each user had their own dashboard pages:**
- 3 pages × 10,000 users = 30,000 rows in dashboard_pages
- 10,000 rows in dashboard_settings
- 30,000 rows in product_orders
- **Total: 70,000 rows for same 10k users**

**Global template is 57% smaller!**

---

## Key Benefits of Global Template

### ✅ Performance
- Single query loads template for all users
- No per-user page copies to maintain
- Faster dashboard load times

### ✅ Consistency
- All users see professional, admin-designed UX
- No broken or poorly designed custom dashboards
- Brand consistency maintained

### ✅ Maintainability
- Admin updates template once
- Changes instantly apply to all users
- No migration needed to update layouts

### ✅ Scalability
- Database doesn't grow with user count
- Only user data (product_orders) grows
- Cost-effective at scale

### ✅ Simplicity
- Fewer moving parts
- Easier to debug
- Clearer mental model

---

## Implementation Checklist - Phase 3

### Database
- [ ] Create migration `0XX_create_user_dashboard_system.sql`
- [ ] Add `user_dashboard_pages` table (no user_id column)
- [ ] Add `user_dashboard_settings` table (singleton pattern)
- [ ] Add RLS policies (admins manage, users read)
- [ ] Create seed migration `0XX_seed_default_user_dashboard.sql`
- [ ] Seed default pages (overview, lead-magnets, settings)
- [ ] Seed default sidebar config

### Server Actions
- [ ] Create `user-dashboard-page-actions.ts` (admin template management)
- [ ] Create `user-dashboard-settings-actions.ts` (admin settings management)
- [ ] Create `user-dashboard-actions.ts` (user read access + data queries)
- [ ] Add admin role checks to all admin actions
- [ ] Test RLS policies prevent users from editing template

### Admin Builder UI
- [ ] Create `/admin/user-dashboard-builder/page.tsx`
- [ ] Create `UserDashboardBuilderHeader.tsx`
- [ ] Duplicate and adapt `BlockListPanel.tsx`
- [ ] Duplicate and adapt `BlockPropertiesPanel.tsx`
- [ ] Duplicate and adapt `BlockTypesPanel.tsx`
- [ ] Create `useUserDashboardData.ts` hook
- [ ] Create `useUserDashboardBuilder.ts` hook

### Admin Block Editors
- [ ] Create `UserDashboardSidebarBlock.tsx` (protected block)
- [ ] Create `UserDashboardLeadMagnetListBlock.tsx`
- [ ] Create `UserDashboardStatsBlock.tsx`
- [ ] Create `UserDashboardRichTextBlock.tsx` (reuse from pages)
- [ ] Create `UserDashboardAccountInfoBlock.tsx`

### Frontend Dashboard
- [ ] Create `/dashboard/layout.tsx` (auth required, sidebar layout)
- [ ] Create `/dashboard/[slug]/page.tsx` (dynamic page renderer)
- [ ] Create `UserDashboardSidebar.tsx`
- [ ] Create `UserDashboardBlockRenderer.tsx`
- [ ] Create `UserDashboardLeadMagnetList.tsx`
- [ ] Create `UserDashboardStats.tsx`
- [ ] Create `UserDashboardAccountInfo.tsx`
- [ ] Create `useUserDashboard.ts` hook
- [ ] Add redirect from `/dashboard` to `/dashboard/overview`

### Integration
- [ ] Update login redirect to include `/dashboard` option
- [ ] Update Phase 2 welcome emails to link to dashboard
- [ ] Test new user flow: Create account → Login → See dashboard
- [ ] Test existing user flow: Login → See dashboard with lead magnets

### Testing
- [ ] Admin can create/edit/delete dashboard pages
- [ ] Admin can configure sidebar
- [ ] Admin changes appear immediately for all users
- [ ] Users can view but not edit template
- [ ] Users see only their own product_orders
- [ ] Lead magnet list shows correct user data
- [ ] Stats calculate correctly per user
- [ ] Access links work (token-based)
- [ ] Sidebar navigation works
- [ ] Protected blocks cannot be deleted

### Documentation
- [ ] Document user dashboard system
- [ ] Create admin guide for dashboard builder
- [ ] Document available block types
- [ ] Add screenshots to docs

---

## Future: Tenant Dashboard (Phase 4)

### Key Differences from User Dashboard

**Tenant Dashboard** will be for site owners/managers:

**Different Block Types:**
- Site analytics (views, conversions)
- Order management (list, filter, export)
- Customer list (all customers for their sites)
- Revenue charts
- Integration management
- Site settings editor

**Different Data Scope:**
- Tenants see data for sites they own (via `sites.user_id`)
- Query: `sites WHERE user_id = current_user`
- Then: `product_orders WHERE site_id IN user_sites`

**Same Pattern, Different Tables:**
- `tenant_dashboard_pages` (global template)
- `tenant_dashboard_settings` (global sidebar)
- Route: `/tenant-dashboard`
- Builder: `/admin/tenant-dashboard-builder`

**Separate System:**
- No overlap with user dashboard
- Different RLS policies (check site ownership)
- Can coexist with user dashboard

---

## Conclusion - Phase 3

Phase 3 implements a **user-facing dashboard builder** that:

✅ **Reuses proven architecture** from pages builder (80% code reuse)
✅ **Global template approach** for simplicity and performance
✅ **Admin designs once** - all users benefit
✅ **Personalizes data** - each user sees their own lead magnets
✅ **Scalable** - doesn't grow with user count
✅ **Future-proof** - leaves room for tenant dashboard
✅ **Integrates seamlessly** with Phase 2 account creation

**Next Steps After Phase 3:**
- **Phase 4:** Tenant Dashboard (site owner level)
- **Phase 5:** Analytics and reporting
- **Phase 6:** Advanced automation (drip campaigns, follow-ups)
