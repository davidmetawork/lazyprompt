import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@lazyprompt/database';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    // For development only - allows easy login without OAuth setup
    CredentialsProvider({
      name: 'Development',
      credentials: {
        name: { label: 'Name', type: 'text', placeholder: 'Test User' },
        email: { label: 'Email', type: 'email', placeholder: 'test@example.com' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        
        // For development only, create a user if one doesn't exist
        const user = await prisma.user.upsert({
          where: { email: credentials.email },
          update: {},
          create: {
            name: credentials.name || 'Test User',
            email: credentials.email,
          },
        });
        
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
}; 