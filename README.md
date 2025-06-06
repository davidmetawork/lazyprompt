# LazyPrompt - AI Prompt Marketplace

A modern, full-stack marketplace for buying, selling, and discovering AI prompts. Built with Next.js, TypeScript, and Prisma.

## 🚀 Features

- **Marketplace**: Browse and purchase AI prompts
- **User Authentication**: Secure login with NextAuth.js
- **Database Integration**: Prisma ORM with PostgreSQL
- **Modern UI**: Tailwind CSS with responsive design
- **Monorepo Structure**: Organized with Turborepo
- **TypeScript**: Full type safety across the stack

## 🏗️ Project Structure

```
LazyPrompt/
├── apps/
│   ├── marketplace/          # Main marketplace application
│   └── web/                  # Additional web application
├── packages/
│   ├── auth/                 # Authentication package
│   ├── database/             # Database schema and client
│   ├── ui/                   # Shared UI components
│   └── config/               # Shared configurations
└── scripts/                  # Build and deployment scripts
```

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: NextAuth.js
- **Database**: Prisma ORM with PostgreSQL
- **Build System**: Turborepo
- **Deployment**: Vercel

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- PostgreSQL database

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/LazyPrompt.git
cd LazyPrompt
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your database and auth credentials
```

4. Set up the database:
```bash
cd packages/database
npx prisma migrate dev
npx prisma generate
```

5. Build the packages:
```bash
npm run build
```

6. Start the development server:
```bash
cd apps/marketplace
npm run dev
```

The application will be available at `http://localhost:3000`

## 📦 Available Scripts

- `npm run build` - Build all packages and applications
- `npm run dev` - Start development servers
- `npm run lint` - Run ESLint across all packages
- `npm run clean` - Clean build artifacts

## 🌐 Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy!

### Environment Variables

Required environment variables for production:

```env
DATABASE_URL=your_postgresql_connection_string
NEXTAUTH_URL=your_production_url
NEXTAUTH_SECRET=your_nextauth_secret
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [Tailwind CSS](https://tailwindcss.com/)
- Database management with [Prisma](https://prisma.io/)
- Authentication powered by [NextAuth.js](https://next-auth.js.org/)

---

Made with ❤️ for the AI community
