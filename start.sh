#!/bin/bash

echo "=== LazyPrompt Startup Script ==="
echo "This script will help you set up and run the LazyPrompt application."
echo

# Create basic directory structure if it doesn't exist
mkdir -p apps/web/src
mkdir -p packages/database/prisma

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  chmod +x install-deps.sh
  ./install-deps.sh
else
  echo "Dependencies already installed."
fi

echo
echo "Setting up database..."
mkdir -p scripts
cat << 'EOF' > scripts/setup-db.sh
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
EOF

chmod +x scripts/setup-db.sh
./scripts/setup-db.sh

echo
echo "Starting development server..."
cd apps/web
npm run dev

# This part won't execute until the dev server is stopped
echo
echo "Thank you for using LazyPrompt!" 