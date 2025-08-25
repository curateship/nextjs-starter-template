"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Globe, AlertTriangle } from "lucide-react"

interface SEOSettingsCardProps {
  productPrefix?: string
  postPrefix?: string
  siteDomain?: string
  onProductPrefixChange?: (value: string) => void
  onPostPrefixChange?: (value: string) => void
}

export function SEOSettingsCard({
  productPrefix = "",
  postPrefix = "",
  siteDomain = "yoursite.com",
  onProductPrefixChange,
  onPostPrefixChange,
}: SEOSettingsCardProps) {
  const [tempProductPrefix, setTempProductPrefix] = useState(productPrefix)
  const [tempPostPrefix, setTempPostPrefix] = useState(postPrefix)
  const [validationErrors, setValidationErrors] = useState<{
    product?: string
    post?: string
    conflict?: string
  }>({})

  // Update local state when props change
  useEffect(() => {
    setTempProductPrefix(productPrefix)
    setTempPostPrefix(postPrefix)
  }, [productPrefix, postPrefix])

  // Reserved prefixes that cannot be used
  const reservedPrefixes = [
    'admin', 'api', 'www', 'mail', 'ftp', 'localhost', 'app', 'mobile',
    'static', 'assets', 'cdn', 'img', 'images', 'css', 'js', 'fonts',
    '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml'
  ]

  // Validate prefix
  const validatePrefix = (prefix: string): string | undefined => {
    if (!prefix.trim()) return undefined // Empty is valid (no prefix)
    
    // Check format
    const prefixRegex = /^[a-z0-9-]+$/
    if (!prefixRegex.test(prefix)) {
      return "Only lowercase letters, numbers, and hyphens allowed"
    }

    // Check length
    if (prefix.length > 20) {
      return "Prefix must be 20 characters or less"
    }

    // Check reserved words
    if (reservedPrefixes.includes(prefix.toLowerCase())) {
      return "This prefix is reserved and cannot be used"
    }

    return undefined
  }

  // Check for conflicts between prefixes
  const checkPrefixConflict = (productPrefix: string, postPrefix: string): string | undefined => {
    const cleanProduct = productPrefix.trim().toLowerCase()
    const cleanPost = postPrefix.trim().toLowerCase()
    
    if (cleanProduct && cleanPost && cleanProduct === cleanPost) {
      return "Product and post prefixes cannot be the same"
    }
    
    return undefined
  }

  // Handle prefix changes with validation
  const handleProductPrefixChange = (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setTempProductPrefix(cleanValue)
    
    // Validate
    const productError = validatePrefix(cleanValue)
    const conflictError = checkPrefixConflict(cleanValue, tempPostPrefix)
    
    setValidationErrors({
      ...validationErrors,
      product: productError,
      conflict: conflictError
    })

    if (!productError && !conflictError) {
      onProductPrefixChange?.(cleanValue)
    }
  }

  const handlePostPrefixChange = (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setTempPostPrefix(cleanValue)
    
    // Validate
    const postError = validatePrefix(cleanValue)
    const conflictError = checkPrefixConflict(tempProductPrefix, cleanValue)
    
    setValidationErrors({
      ...validationErrors,
      post: postError,
      conflict: conflictError
    })

    if (!postError && !conflictError) {
      onPostPrefixChange?.(cleanValue)
    }
  }

  // Example URLs for preview
  const getExampleUrls = () => {
    const productUrl = tempProductPrefix 
      ? `${siteDomain}/${tempProductPrefix}/iphone-case`
      : `${siteDomain}/iphone-case`
    
    const postUrl = tempPostPrefix
      ? `${siteDomain}/${tempPostPrefix}/my-blog-post`
      : `${siteDomain}/my-blog-post`
      
    return { productUrl, postUrl }
  }

  const { productUrl, postUrl } = getExampleUrls()

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Globe className="w-5 h-5" />
          <span>SEO Settings</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Customize URL structure for different content types. Leave empty for no prefix.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pb-8">
        {/* Product Prefix */}
        <div className="space-y-2">
          <Label htmlFor="product-prefix">Product URL Prefix</Label>
          <Input
            id="product-prefix"
            value={tempProductPrefix}
            onChange={(e) => handleProductPrefixChange(e.target.value)}
            placeholder="product (leave empty for no prefix)"
            className={validationErrors.product ? "border-red-500" : ""}
          />
          {validationErrors.product && (
            <p className="text-sm text-red-600 flex items-center space-x-1">
              <AlertTriangle className="w-4 h-4" />
              <span>{validationErrors.product}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Example: <strong>{productUrl}</strong>
          </p>
        </div>

        {/* Post Prefix */}
        <div className="space-y-2">
          <Label htmlFor="post-prefix">Post URL Prefix</Label>
          <Input
            id="post-prefix"
            value={tempPostPrefix}
            onChange={(e) => handlePostPrefixChange(e.target.value)}
            placeholder="blog (leave empty for no prefix)"
            className={validationErrors.post ? "border-red-500" : ""}
          />
          {validationErrors.post && (
            <p className="text-sm text-red-600 flex items-center space-x-1">
              <AlertTriangle className="w-4 h-4" />
              <span>{validationErrors.post}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Example: <strong>{postUrl}</strong>
          </p>
        </div>

        {/* Conflict Error */}
        {validationErrors.conflict && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800 flex items-center space-x-1">
              <AlertTriangle className="w-4 h-4" />
              <span>{validationErrors.conflict}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}