#!/bin/bash

# Script to set up the database for LazyPrompt
echo "Setting up the LazyPrompt database..."

# Navigate to the database package
cd packages/database

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Push the schema to the database
echo "Creating database schema..."
npx prisma db push

# Run seed script to populate initial data
echo "Seeding database with initial data..."
npx ts-node prisma/seed.ts

echo "Database setup complete!"
