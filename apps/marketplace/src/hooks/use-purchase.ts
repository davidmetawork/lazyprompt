'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

/**
 * Hook for handling prompt purchases
 */
export function usePurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Purchase a prompt
   * @param promptId - The ID of the prompt to purchase
   * @param price - The price of the prompt
   */
  const purchasePrompt = async (promptId: string, price: number) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // In a real app, this would call the API
      // await apiClient.post<{ success: boolean }>('/purchases', {
      //   promptId,
      //   price
      // });
      
      // For demo, simulate a successful purchase with a delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return true;
    } catch (err) {
      let errorMessage = 'Failed to complete purchase. Please try again.';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  return {
    purchasePrompt,
    isLoading,
    error
  };
} 