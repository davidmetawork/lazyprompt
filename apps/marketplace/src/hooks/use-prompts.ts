'use client';

import { useState, useEffect } from 'react';
// Temporarily disabled for deployment
// import { PromptWithRelations } from '@lazyprompt/database';

// Temporary type definition for deployment
interface PromptWithRelations {
  id: string;
  title: string;
  description: string;
  content: string;
  price: number;
  categoryId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  category: {
    id: string;
    name: string;
    description: string | null;
  };
  _count: {
    purchases: number;
    votes: number;
  };
}

interface PromptsResponse {
  prompts: PromptWithRelations[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface UsePromptsOptions {
  categoryId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function usePrompts({
  categoryId,
  search,
  page = 1,
  limit = 12,
}: UsePromptsOptions = {}) {
  const [prompts, setPrompts] = useState<PromptWithRelations[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page,
    limit,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Temporarily return mock data for deployment
    setIsLoading(false);
    setPrompts([]);
    setPagination({
      total: 0,
      page,
      limit,
      totalPages: 0,
    });
  }, [categoryId, search, page, limit]);

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  return {
    prompts,
    pagination,
    isLoading,
    error,
    goToPage,
  };
} 