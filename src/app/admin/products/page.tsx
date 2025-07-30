"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"

export default function ProductsPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Products</h1>
            <p className="text-muted-foreground mt-1">
              Manage your product catalog
            </p>
          </div>
          <a href="/admin/products/new" className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 inline-block">
            Add Product
          </a>
        </div>
        
        <div className="bg-card border rounded-lg">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Products</h3>
              <div className="relative">
                <button 
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 text-sm flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter</span>
                  <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
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
                  <h4 className="font-medium">Laptop Pro X1</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$1,299.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">PH</span>
                </div>
                <div>
                  <h4 className="font-medium">Smartphone Galaxy S23</h4>
                  <p className="text-sm text-muted-foreground">Electronics</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$899.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">HD</span>
                </div>
                <div>
                  <h4 className="font-medium">Wireless Headphones Pro</h4>
                  <p className="text-sm text-muted-foreground">Audio</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$249.00</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Low Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">TB</span>
                </div>
                <div>
                  <h4 className="font-medium">External SSD 1TB</h4>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$129.00</span>
                <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Out of Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">KB</span>
                </div>
                <div>
                  <h4 className="font-medium">Mechanical Keyboard Pro</h4>
                  <p className="text-sm text-muted-foreground">Accessories</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$199.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 6 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MS</span>
                </div>
                <div>
                  <h4 className="font-medium">Gaming Mouse RGB</h4>
                  <p className="text-sm text-muted-foreground">Accessories</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$89.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 7 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MN</span>
                </div>
                <div>
                  <h4 className="font-medium">4K Monitor 27"</h4>
                  <p className="text-sm text-muted-foreground">Display</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$399.00</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Low Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 8 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">TB</span>
                </div>
                <div>
                  <h4 className="font-medium">USB-C Hub 7-in-1</h4>
                  <p className="text-sm text-muted-foreground">Accessories</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$59.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 9 */}
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
                <span className="text-sm text-muted-foreground">$149.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 10 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">CP</span>
                </div>
                <div>
                  <h4 className="font-medium">Webcam HD 1080p</h4>
                  <p className="text-sm text-muted-foreground">Accessories</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$79.00</span>
                <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Out of Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 11 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">KB</span>
                </div>
                <div>
                  <h4 className="font-medium">Wireless Charger Pad</h4>
                  <p className="text-sm text-muted-foreground">Accessories</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$45.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 12 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">LT</span>
                </div>
                <div>
                  <h4 className="font-medium">Laptop Stand Aluminum</h4>
                  <p className="text-sm text-muted-foreground">Accessories</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$35.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 13 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">TB</span>
                </div>
                <div>
                  <h4 className="font-medium">Portable SSD 500GB</h4>
                  <p className="text-sm text-muted-foreground">Storage</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$89.00</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Low Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Product 14 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">HD</span>
                </div>
                <div>
                  <h4 className="font-medium">Noise Cancelling Headphones</h4>
                  <p className="text-sm text-muted-foreground">Audio</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">$299.00</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">In Stock</span>
                <button className="text-muted-foreground hover:text-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
} 