import { ComponentType } from "react"
import { DefaultProductContentConfig } from "./DefaultProductContentConfig"

export interface ProductContentStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<ProductContentStyleAdminProps>
}

export interface ProductContentStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const PRODUCT_CONTENT_STYLES: Record<string, ProductContentStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Product info with image and description',
    AdminPanel: DefaultProductContentConfig,
  },
}
