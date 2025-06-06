'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

interface Category {
  id: string;
  name: string;
}

/**
 * Hook for fetching categories
 */
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // In a real app, fetch from the API
        // const response = await apiClient.get<Category[]>('/categories');
        // setCategories(response);
        
        // For demo, use mock data
        await new Promise(resolve => setTimeout(resolve, 800));
        
        setCategories([
          { id: 'cat1', name: 'Writing' },
          { id: 'cat2', name: 'Programming' },
          { id: 'cat3', name: 'Marketing' },
          { id: 'cat4', name: 'Education' },
          { id: 'cat5', name: 'Design' },
        ]);
      } catch (err) {
        setError('Failed to load categories');
        console.error('Error fetching categories:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return {
    categories,
    isLoading,
    error
  };
} 