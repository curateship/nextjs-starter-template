import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const orderTypeEnum = pgEnum('order_type_enum', ['free_signup', 'paid_purchase', 'lead_magnet'])
export const paymentStatusEnum = pgEnum('payment_status_enum', ['pending', 'succeeded', 'failed', 'canceled'])

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
  isHomepage: boolean('is_homepage').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  contentBlocks: jsonb('content_blocks').default({}),
  featuredImage: text('featured_image'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_products_site_slug_unique').on(table.siteId, table.slug),
  index('idx_products_site_published').on(table.siteId, table.isPublished),
])

export const productOrders = pgTable('product_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  orderType: orderTypeEnum('order_type').notNull(),
  stripeSessionId: varchar('stripe_session_id', { length: 255 }),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  amountTotal: integer('amount_total'),
  currency: varchar('currency', { length: 3 }),
  paymentStatus: paymentStatusEnum('payment_status'),
  accessToken: varchar('access_token', { length: 255 }).notNull().unique(),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  clickCount: integer('click_count').default(0),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_product_orders_site_id').on(table.siteId),
  index('idx_product_orders_product_id').on(table.productId),
  index('idx_product_orders_email').on(table.customerEmail),
  index('idx_product_orders_token').on(table.accessToken),
  index('idx_product_orders_site_type').on(table.siteId, table.orderType),
])

export const productsRelations = relations(products, ({ one }) => ({
  site: one(sites, {
    fields: [products.siteId],
    references: [sites.id],
  }),
}))

export const productOrdersRelations = relations(productOrders, ({ one }) => ({
  site: one(sites, {
    fields: [productOrders.siteId],
    references: [sites.id],
  }),
  product: one(products, {
    fields: [productOrders.productId],
    references: [products.id],
  }),
}))
