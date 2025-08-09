#!/bin/bash

# Dev Server Restart Script
# Fixes "ENOENT: no such file or directory" errors after running npm run build

echo "🧹 Cleaning build artifacts..."
rm -rf .next

echo "🔌 Killing existing server on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting development server..."
npm run dev