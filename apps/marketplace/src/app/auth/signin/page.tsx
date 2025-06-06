'use client';

import { Suspense } from 'react';
import SignInContent from './signin-content';

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen">Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
} 