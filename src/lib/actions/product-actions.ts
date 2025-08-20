'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { trackImageUsageAction, getImageByUrlAction, removeImageUsageAction } from './image-actions'

// Create admin client with service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Create server client to access user session
async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export interface Product {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  meta_keywords: string | null
  featured_image: string | null
  rich_text: string | null
  show_default_block: boolean
  is_homepage: boolean
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ProductWithDetails extends Product {
  site_name: string
  subdomain: string
  user_id: string
}

export interface CreateProductData {
  title: string
  slug?: string
  meta_description?: string
  meta_keywords?: string
  featured_image?: string
  rich_text?: string
  is_published?: boolean
}

export interface UpdateProductData {
  title?: string
  slug?: string
  meta_description?: string
  meta_keywords?: string
  featured_image?: string
  rich_text?: string
  is_published?: boolean
}

/**
 * Get all products globally
 */
export async function getAllProductsAction(): Promise<{ data: Product[] | null; error: string | null }> {
  try {
    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('display_order', { ascending: true })

    if (error) {
      // Check if it's a table not found error
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        // Products table doesn't exist yet - return empty array
        return { data: [], error: null }
      }
      return { data: null, error: `Failed to fetch products: ${error.message}` }
    }

    return { data: data as Product[], error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get all products for a site
 */
export async function getSiteProductsAction(siteId: string): Promise<{ data: Product[] | null; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Verify user owns this site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })

    if (error) {
      // Check if it's a table not found error
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        // Products table doesn't exist yet - return mock data for now
        return {
          data: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              site_id: siteId,
              title: 'New Product',
              slug: 'new-product',
              meta_description: 'A sample product to get you started',
              meta_keywords: null,
              featured_image: null,
              rich_text: null,
              show_default_block: true,
              is_homepage: false,
              is_published: true,
              display_order: 1,
              content_blocks: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          error: null
        }
      }
      return { data: null, error: `Failed to fetch products: ${error.message}` }
    }

    return { data: data as Product[], error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Get a single product by ID
 */
export async function getProductByIdAction(productId: string): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { data: null, error: 'Invalid product ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // First get the product to check which site it belongs to
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError) {
      // Check if it's a table not found error
      if (productError.message.includes('relation') && productError.message.includes('does not exist')) {
        // Products table doesn't exist yet - return mock data for now
        return {
          data: {
            id: productId,
            site_id: 'mock-site-id',
            title: 'Sample Product',
            slug: 'sample-product',
            meta_description: 'This is a sample product',
            meta_keywords: '',
            featured_image: null,
            rich_text: null,
            show_default_block: true,
            is_homepage: false,
            is_published: true,
            display_order: 1,
            content_blocks: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          error: null
        }
      }
      
      // Product not found - this is expected if the product doesn't exist yet
      if (productError.code === 'PGRST116') {
        return { data: null, error: 'Product not found. The database migration may not have created default products yet.' }
      }
      
      return { data: null, error: `Failed to fetch product: ${productError.message}` }
    }

    if (!product) {
      return { data: null, error: 'Product not found' }
    }
    

    // Now verify the user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', product.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Ensure all dates are properly serialized
    const serializedProduct = {
      ...product,
      created_at: product.created_at ? new Date(product.created_at).toISOString() : new Date().toISOString(),
      updated_at: product.updated_at ? new Date(product.updated_at).toISOString() : new Date().toISOString()
    }
    
    return { data: serializedProduct, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Create a new global product
 */
export async function createGlobalProductAction(productData: CreateProductData): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate required fields
    if (!productData.title?.trim()) {
      return { data: null, error: 'Product title is required' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the user's first site as the default site for the product
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (!sites || sites.length === 0) {
      return { data: null, error: 'You must have at least one site to create products' }
    }

    const siteId = sites[0].id

    // Generate slug from title if not provided
    let slug = productData.slug
    if (!slug) {
      slug = productData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    // Validate slug format
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
    }

    // Check for reserved slugs
    const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return { data: null, error: 'This slug is reserved and cannot be used.' }
    }

    // Check if slug already exists globally
    const { data: existingProduct, error: slugCheckError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('slug', slug)
      .single()

    if (slugCheckError && slugCheckError.code !== 'PGRST116') {
      return { data: null, error: 'Failed to validate slug uniqueness' }
    }

    if (existingProduct) {
      return { data: null, error: 'A product with this slug already exists' }
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('products')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the product
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([{
        site_id: siteId, // Use the user's first site
        title: productData.title.trim(),
        slug,
        meta_description: productData.meta_description?.trim() || null,
        meta_keywords: productData.meta_keywords?.trim() || null,
        rich_text: productData.rich_text?.trim() || null,
        is_homepage: false, // Products never have homepage functionality
        is_published: productData.is_published !== false,
        display_order: nextOrder,
        content_blocks: {}
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to create product: ${error.message}` }
    }

    return { data: data as Product, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Create a new product for a site
 */
export async function createProductAction(siteId: string, productData: CreateProductData): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    // Validate required fields
    if (!productData.title?.trim()) {
      return { data: null, error: 'Product title is required' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Verify user owns this site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Generate slug from title if not provided
    let slug = productData.slug
    if (!slug) {
      slug = productData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    // Validate slug format
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
    }

    // Check for reserved slugs
    const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return { data: null, error: 'This slug is reserved and cannot be used.' }
    }

    // Check if slug already exists for this site
    const { data: existingProduct, error: slugCheckError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (slugCheckError && slugCheckError.code !== 'PGRST116') {
      return { data: null, error: 'Failed to validate slug uniqueness' }
    }

    if (existingProduct) {
      return { data: null, error: 'A product with this slug already exists' }
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('products')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the product
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([{
        site_id: siteId,
        title: productData.title.trim(),
        slug,
        meta_description: productData.meta_description?.trim() || null,
        meta_keywords: productData.meta_keywords?.trim() || null,
        featured_image: productData.featured_image?.trim() || null,
        rich_text: productData.rich_text?.trim() || null,
        is_homepage: false, // Products never have homepage functionality
        is_published: productData.is_published !== false,
        display_order: nextOrder,
        content_blocks: {}
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to create product: ${error.message}` }
    }

    // Track featured image usage if product has one and is published
    if (data.featured_image && data.is_published) {
      const { data: imageId } = await getImageByUrlAction(data.featured_image)
      if (imageId) {
        await trackImageUsageAction(imageId, siteId, "product", "featured-image")
      }
    }

    return { data: data as Product, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update an existing product
 */
export async function updateProductAction(productId: string, updates: UpdateProductData): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { data: null, error: 'Invalid product ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return { data: null, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', product.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Product title cannot be empty' }
    }

    // Validate and process slug if being updated
    let processedUpdates = { ...updates }
    if (updates.slug !== undefined) {
      const slug = updates.slug.trim()
      
      // Validate slug format
      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      // Check for reserved slugs
      const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      // Check if slug already exists for this site (excluding current product)
      const { data: existingProduct } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('site_id', product.site_id)
        .eq('slug', slug)
        .neq('id', productId)
        .single()

      if (existingProduct) {
        return { data: null, error: 'A product with this slug already exists' }
      }

      processedUpdates.slug = slug
    }

    // Clean up the updates object
    const finalUpdates: any = {}
    Object.entries(processedUpdates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'title' || key === 'meta_description' || key === 'meta_keywords' || key === 'featured_image' || key === 'rich_text') {
          finalUpdates[key] = typeof value === 'string' ? value.trim() || null : value
        } else {
          finalUpdates[key] = value
        }
      }
    })

    // Update the product
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({
        ...finalUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to update product: ${error.message}` }
    }

    // Only track image usage if featured_image was actually updated
    if (updates.featured_image !== undefined) {
      // Remove old usage tracking if there was a previous image
      if (product.featured_image) {
        const { data: oldImageId } = await getImageByUrlAction(product.featured_image)
        if (oldImageId) {
          await removeImageUsageAction(oldImageId, product.site_id, "product", "featured-image")
        }
      }
      
      // Add new usage tracking if new image exists and product is published
      if (data.featured_image && data.is_published) {
        const { data: imageId } = await getImageByUrlAction(data.featured_image)
        if (imageId) {
          await trackImageUsageAction(imageId, product.site_id, "product", "featured-image")
        }
      }
    }

    return { data: data as Product, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Delete a product
 */
export async function deleteProductAction(productId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { success: false, error: 'Invalid product ID format' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', product.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Delete associated blocks first (cleanup orphaned blocks)
    const { error: blockDeleteError } = await supabaseAdmin
      .from('page_blocks')
      .delete()
      .eq('site_id', product.site_id)
      .eq('page_slug', `product-${product.slug}`)

    if (blockDeleteError) {
      console.warn('Failed to delete associated blocks:', blockDeleteError.message)
      // Continue with product deletion even if block cleanup fails
    }

    // Delete the product
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', productId)

    if (error) {
      return { success: false, error: `Failed to delete product: ${error.message}` }
    }

    return { success: true, error: null }
  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Duplicate a product
 */
export async function duplicateProductAction(productId: string, newTitle: string): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { data: null, error: 'Invalid product ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New product title is required' }
    }

    // Get the authenticated user's ID from the session
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the original product
    const { data: originalProduct, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !originalProduct) {
      return { data: null, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', originalProduct.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Generate new slug
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    let newSlug = baseSlug
    let counter = 1

    // Ensure unique slug
    while (true) {
      const { data: existingProduct } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('site_id', originalProduct.site_id)
        .eq('slug', newSlug)
        .single()

      if (!existingProduct) break

      newSlug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the next display order
    const { data: orderData } = await supabaseAdmin
      .from('products')
      .select('display_order')
      .eq('site_id', originalProduct.site_id)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = orderData && orderData.length > 0 ? orderData[0].display_order + 1 : 1

    // Create the duplicate product
    const { data: newProduct, error } = await supabaseAdmin
      .from('products')
      .insert([{
        site_id: originalProduct.site_id,
        title: newTitle.trim(),
        slug: newSlug,
        meta_description: originalProduct.meta_description,
        meta_keywords: originalProduct.meta_keywords,
        rich_text: originalProduct.rich_text,
        is_homepage: false, // Products are never homepage
        is_published: originalProduct.is_published,
        display_order: nextOrder,
        content_blocks: originalProduct.content_blocks || {}
      }])
      .select()
      .single()

    if (error) {
      return { data: null, error: `Failed to duplicate product: ${error.message}` }
    }

    // Content blocks are already copied in the product creation above via content_blocks field
    // No additional block copying needed since we now use JSON storage

    return { data: newProduct as Product, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}` 
    }
  }
}

/**
 * Update product content blocks (replaces the old product_blocks system)
 */
export async function updateProductBlocksAction(productId: string, contentBlocks: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { success: false, error: 'Invalid product ID format' }
    }

    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the product to verify ownership
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, site_id')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', product.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // SECURITY: Validate content blocks structure and size
    if (typeof contentBlocks !== 'object' || contentBlocks === null) {
      return { success: false, error: 'Invalid content blocks format' }
    }

    // Prevent DoS: Limit JSON size (50KB max)
    const jsonSize = JSON.stringify(contentBlocks).length
    if (jsonSize > 50000) {
      return { success: false, error: 'Content blocks too large' }
    }

    // SECURITY: Validate allowed block types
    const allowedBlockTypes = ['product-default', 'product-hero', 'product-details', 'product-gallery', 'product-features', 'product-hotspot', 'product-pricing', 'faq']
    for (const blockType of Object.keys(contentBlocks)) {
      if (!allowedBlockTypes.includes(blockType)) {
        return { success: false, error: `Invalid block type: ${blockType}` }
      }
      
      // Validate block data structure
      const blockData = contentBlocks[blockType]
      if (typeof blockData !== 'object' || blockData === null) {
        return { success: false, error: `Invalid data for block type: ${blockType}` }
      }
    }

    // Update the product content_blocks
    const { error } = await supabaseAdmin
      .from('products')
      .update({
        content_blocks: contentBlocks,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)

    if (error) {
      return { success: false, error: `Failed to update product blocks: ${error.message}` }
    }

    return { success: true }

  } catch (error) {
    console.error('Error updating product blocks:', error)
    return { success: false, error: 'Failed to update product blocks' }
  }
}

/**
 * Get product content blocks by block type
 */
export async function getProductBlockAction(productId: string, blockType: string): Promise<{ success: boolean; block?: any; error?: string }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { success: false, error: 'Invalid product ID format' }
    }

    // Get the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('content_blocks')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found' }
    }

    const block = product.content_blocks?.[blockType] || null
    return { success: true, block }

  } catch (error) {
    console.error('Error getting product block:', error)
    return { success: false, error: 'Failed to get product block' }
  }
}