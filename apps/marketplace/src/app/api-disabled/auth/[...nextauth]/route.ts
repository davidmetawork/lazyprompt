// This file needs to be present even though it's empty to make TypeScript happy during development
// The actual implementation will be properly loaded once the dependencies are installed

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 