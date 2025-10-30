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
