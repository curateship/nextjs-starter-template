"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Settings, Plus } from "lucide-react"

export default function ProductsPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Products"
          subtitle="Manage your product catalog"
          primaryAction={{
            label: "Add Product",
            href: "/admin/products/builder"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Product List</h3>
              <div className="relative">
                <Button 
                  variant="outline"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter</span>
                  <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
                {isFilterOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                    <div className="py-1">
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        All Products
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        In Stock
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Low Stock
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Out of Stock
                      </button>
                      <div className="border-t my-1"></div>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Electronics
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Audio
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Storage
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="divide-y">
            {/* Product 1 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">LP</span>
                </div>
                <div>
                  <h4 className="font-medium">Laptop Pro</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$1,299</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/laptop-pro">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">HP</span>
                </div>
                <div>
                  <h4 className="font-medium">Headphones Pro</h4>
                  <p className="text-sm text-muted-foreground">Audio</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$299</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Low Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/headphones-pro">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">SS</span>
                </div>
                <div>
                  <h4 className="font-medium">Solid State Drive</h4>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$199</span>
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Out of Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/solid-state-drive">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">KB</span>
                </div>
                <div>
                  <h4 className="font-medium">Wireless Keyboard</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$89</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/wireless-keyboard">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MS</span>
                </div>
                <div>
                  <h4 className="font-medium">Gaming Mouse</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$129</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/gaming-mouse">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 6 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">SP</span>
                </div>
                <div>
                  <h4 className="font-medium">Bluetooth Speaker</h4>
                  <p className="text-sm text-muted-foreground">Audio</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$159</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/bluetooth-speaker">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 7 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">HD</span>
                </div>
                <div>
                  <h4 className="font-medium">External Hard Drive</h4>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$89</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Low Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/external-hard-drive">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 8 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">WC</span>
                </div>
                <div>
                  <h4 className="font-medium">Webcam HD</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$79</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/webcam-hd">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 9 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MC</span>
                </div>
                <div>
                  <h4 className="font-medium">Microphone Pro</h4>
                  <p className="text-sm text-muted-foreground">Audio</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$199</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/microphone-pro">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 10 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">TB</span>
                </div>
                <div>
                  <h4 className="font-medium">USB Thumb Drive</h4>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$29</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/usb-thumb-drive">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 11 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MT</span>
                </div>
                <div>
                  <h4 className="font-medium">Monitor 4K</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$599</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">In Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/monitor-4k">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 12 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">AC</span>
                </div>
                <div>
                  <h4 className="font-medium">Audio Cable</h4>
                  <p className="text-sm text-muted-foreground">Audio</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$19</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Low Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/audio-cable">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product 13 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">CD</span>
                </div>
                <div>
                  <h4 className="font-medium">CD Drive</h4>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$49</span>
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Out of Stock</span>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/admin/products/builder/cd-drive">
                      <Settings className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
} 