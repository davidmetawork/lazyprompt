# Deployment Guide

## 🚀 Deploy LazyPrompt to GitHub and Vercel

### Step 1: Create GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Fill in the repository details:
   - **Repository name**: `LazyPrompt` (or your preferred name)
   - **Description**: `AI Prompt Marketplace - Buy, sell, and discover AI prompts`
   - **Visibility**: Public (recommended) or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### Step 2: Push Code to GitHub

After creating the repository, run these commands in your terminal:

```bash
# Add the GitHub repository as remote origin
git remote add origin https://github.com/YOUR_USERNAME/LazyPrompt.git

# Push your code to GitHub
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3: Deploy to Vercel

1. Go to [Vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click "New Project"
3. Import your LazyPrompt repository from GitHub
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: Leave as default (Vercel will detect the monorepo)
   - **Build Command**: `cd apps/marketplace && npm run build`
   - **Output Directory**: `apps/marketplace/.next`
   - **Install Command**: `npm install`

### Step 4: Configure Environment Variables

In your Vercel project dashboard, go to Settings → Environment Variables and add:

#### Required Variables:
```env
DATABASE_URL=your_postgresql_connection_string
NEXTAUTH_URL=https://your-vercel-app-url.vercel.app
NEXTAUTH_SECRET=your_random_secret_string
```

#### Optional (for OAuth providers):
```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

### Step 5: Set Up Database

#### Option A: Use Vercel Postgres (Recommended)
1. In your Vercel project, go to Storage tab
2. Create a new Postgres database
3. Copy the connection string to your `DATABASE_URL` environment variable

#### Option B: Use External Database
- [Supabase](https://supabase.com) (Free tier available)
- [PlanetScale](https://planetscale.com) (Free tier available)
- [Railway](https://railway.app) (Free tier available)

### Step 6: Run Database Migrations

After setting up your database, you'll need to run migrations:

1. Install Vercel CLI: `npm i -g vercel`
2. Link your project: `vercel link`
3. Pull environment variables: `vercel env pull .env.local`
4. Run migrations: `cd packages/database && npx prisma migrate deploy`
5. Generate Prisma client: `npx prisma generate`

### Step 7: Deploy

1. Push any changes to your GitHub repository
2. Vercel will automatically deploy your changes
3. Your app will be live at `https://your-project-name.vercel.app`

## 🔧 Troubleshooting

### Common Issues:

1. **Build fails with module not found**
   - Ensure all packages are properly built: `npm run build`
   - Check that dependencies are correctly listed in package.json files

2. **Database connection issues**
   - Verify your `DATABASE_URL` is correct
   - Ensure your database allows connections from Vercel's IP ranges

3. **Authentication not working**
   - Check that `NEXTAUTH_URL` matches your deployed URL
   - Verify OAuth provider settings if using GitHub/Google auth

### Getting Help:

- Check Vercel deployment logs in your dashboard
- Review Next.js documentation for deployment issues
- Check our GitHub Issues for common problems

## 🎉 Success!

Once deployed, your LazyPrompt marketplace will be live and accessible to users worldwide!

### Next Steps:
- Set up custom domain (optional)
- Configure monitoring and analytics
- Set up continuous deployment workflows
- Add more OAuth providers
- Implement payment processing 