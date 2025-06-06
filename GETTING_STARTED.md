# Getting Started with LazyPrompt

This guide will help you set up and run the LazyPrompt application locally for development.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

## Setup Steps

1. **Install Dependencies**

   Run the installation script to install all required dependencies:

   ```bash
   chmod +x install-deps.sh
   ./install-deps.sh
   ```

2. **Set Up Database**

   Initialize the database for development:

   ```bash
   chmod +x scripts/setup-db.sh
   ./scripts/setup-db.sh
   ```

   This will:
   - Create a SQLite database for local development
   - Run database migrations
   - Seed the database with initial data

3. **Configure Authentication**

   The application is pre-configured with a development authentication provider that doesn't require any setup.

   For production, you'll need to set up OAuth providers:

   - Create a `.env.local` file in the `apps/web` directory
   - Add your OAuth credentials (GitHub, Google, etc.)

4. **Start the Development Server**

   Start the development server:

   ```bash
   npm run dev
   ```

   The application will be available at [http://localhost:3000](http://localhost:3000)

## Project Structure

```
lazyprompt/
├── apps/
│   └── web/                # Next.js web application
│       ├── public/         # Static files
│       └── src/
│           ├── app/        # Next.js App Router routes
│           ├── components/ # React components
│           ├── hooks/      # Custom React hooks
│           └── lib/        # Shared utilities
├── packages/
│   └── database/           # Database package with Prisma schema
├── scripts/                # Utility scripts
├── turbo.json              # Turborepo configuration
└── package.json            # Root package.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build the application
- `npm run lint` - Run linting
- `npm run clean` - Clean build artifacts

## Testing the Application

After setup, you can:

1. Sign in using the development authentication provider
2. Browse the marketplace of prompts
3. View your dashboard
4. Create and sell your own prompts

## Troubleshooting

### Database Issues

If you encounter database issues, you can reset it:

```bash
cd packages/database
npx prisma migrate reset
```

### Authentication Issues

For local development, use the "Development" sign-in option which doesn't require real OAuth credentials.

## Next Steps

- Set up payment processing with Stripe
- Add prompt ratings and reviews
- Create admin dashboard
- Implement analytics for prompt sellers

Happy coding! 