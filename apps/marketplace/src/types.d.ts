// Global type declarations for the project

// Add JSX namespace
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

// Next.js module declarations
declare module 'next/link';
declare module 'next/image';
declare module 'next/navigation';
declare module 'next-auth/react';
declare module '@auth/prisma-adapter';

// Other modules
declare module '@lazyprompt/database';
declare module '@lazyprompt/auth';
declare module '@lazyprompt/ui';

import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
  }
} 