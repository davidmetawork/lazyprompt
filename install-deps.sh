#!/bin/bash

echo "📦 Installing LazyPrompt dependencies..."

# Install root dependencies
npm install

# Create next-env.d.ts to prevent TypeScript errors
mkdir -p apps/web/public
mkdir -p apps/web/src/types
touch apps/web/src/types/nextauth.d.ts

cat << 'EOF' > apps/web/src/types/nextauth.d.ts
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}
EOF

# Install database dependencies first
cd packages/database
echo "🗄️ Installing database dependencies..."
npm install @prisma/client@5.4.2 zod ts-node
npm install -D prisma@5.4.2 @types/node@20 typescript@5.2.2 eslint@8.51.0
npm run build

# Install web app dependencies
cd ../../apps/web
echo "📚 Installing Next.js and React dependencies..."
npm install next@14.0.3 react@18 react-dom@18 next-auth@4.24.5 date-fns@2.30.0 tailwindcss@3.3.5 autoprefixer@10.0.1 postcss@8 @tailwindcss/typography @tailwindcss/forms @auth/prisma-adapter
npm install -D @types/node@20 @types/react@18 @types/react-dom@18 eslint@8 eslint-config-next@14.0.3 typescript@5

# Go back to root
cd ../..

echo "✅ All dependencies have been successfully installed!"
echo "📝 Run './scripts/setup-db.sh' to set up the database"
echo "🚀 Run 'npm run dev' to start the development server" 