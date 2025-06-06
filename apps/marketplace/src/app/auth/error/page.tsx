'use client';

import { Suspense } from 'react';
import AuthErrorContent from './auth-error-content';

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen">Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
} 