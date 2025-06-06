#!/bin/bash

echo "🚀 Building LazyPrompt for deployment..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
npm run clean

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build all packages
echo "🔨 Building packages..."
npm run build

# Build the marketplace app specifically
echo "🏪 Building marketplace application..."
cd apps/marketplace
npm run build

echo "✅ Build completed successfully!"
echo "📋 Next steps:"
echo "1. Push your code to GitHub"
echo "2. Deploy to Vercel"
echo "3. Configure environment variables"
echo "4. Set up your database" 