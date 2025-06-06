'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface PurchaseButtonProps {
  promptId: string;
  hasPurchased: boolean;
  price: number;
}

export function PurchaseButton({ promptId, hasPurchased, price }: PurchaseButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handlePurchase = async () => {
    if (!session) {
      // Redirect to sign in if not logged in
      router.push('/api/auth/signin');
      return;
    }

    setIsPurchasing(true);

    try {
      // In a real app, this would make an API call to process the payment
      // and create a purchase record
      console.log(`Purchasing prompt ${promptId}`);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Refresh the page to show the full content
      router.refresh();
    } catch (error) {
      console.error('Error purchasing prompt:', error);
    } finally {
      setIsPurchasing(false);
    }
  };

  if (hasPurchased) {
    return (
      <div className="text-sm text-green-600 font-medium flex items-center">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5 mr-1" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path 
            fillRule="evenodd" 
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
            clipRule="evenodd" 
          />
        </svg>
        Purchased
      </div>
    );
  }

  return (
    <button
      onClick={handlePurchase}
      disabled={isPurchasing}
      className={`px-4 py-2 rounded-md text-white font-medium ${
        isPurchasing 
          ? 'bg-blue-400 cursor-not-allowed' 
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      {isPurchasing ? 'Processing...' : `Purchase for $${price.toFixed(2)}`}
    </button>
  );
} 