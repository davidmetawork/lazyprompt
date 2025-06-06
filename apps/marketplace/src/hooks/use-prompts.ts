'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { PromptWithRelations } from '@lazyprompt/database';

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
    const fetchPrompts = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const params: Record<string, string> = {
          page: page.toString(),
          limit: limit.toString(),
        };
        
        if (categoryId) {
          params.categoryId = categoryId;
        }
        
        if (search) {
          params.search = search;
        }
        
        const data = await apiClient.get<PromptsResponse>('/prompts', params);
        setPrompts(data.prompts);
        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch prompts');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
  }, [categoryId, search, page, limit]);

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      // The effect will trigger a reload with the new page
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