'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PromptCard, Badge, Button, Input } from '@/components/ui';
import { useSession } from 'next-auth/react';
import { Suspense } from 'react';
import MarketplaceContent from './marketplace-content';

interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  model: string;
  upvoteCount: number;
  isVoted: boolean;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  category: {
    id: string;
    name: string;
  };
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  _count: {
    prompts: number;
  };
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen">Loading...</div>}>
      <MarketplaceContent />
    </Suspense>
  );
} 