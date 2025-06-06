'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { apiClient } from '@/lib/api-client';
import { usePurchase } from '@/hooks/use-purchase';
import { PromptWithRelations } from '@lazyprompt/database';

interface PromptDetailPageProps {
  params: {
    id: string;
  };
}

export default function PromptDetailPage({ params }: PromptDetailPageProps) {
  const { id } = params;
  const router = useRouter();
  const { data: session, status } = useSession();
  const [prompt, setPrompt] = useState<PromptWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<'not_purchased' | 'purchased' | 'checking'>('checking');
  
  const { purchasePrompt, isLoading: isPurchasing, error: purchaseError } = usePurchase();

  useEffect(() => {
    const fetchPromptData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // In a real app, fetch from API
        // const promptData = await apiClient.get<PromptWithRelations>(`/prompts/${id}`);
        
        // For demo, use mock data
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const promptData: PromptWithRelations = {
          id,
          title: 'Advanced SEO Content Generator',
          description: 'Create high-performing SEO content that ranks well and converts readers. This prompt helps you generate content that is both search engine friendly and engaging for human readers.',
          content: status === 'authenticated' && purchaseStatus === 'purchased' 
            ? 'You are an expert SEO content writer with deep understanding of search algorithms and user engagement. Your task is to create content that ranks well in search engines while providing genuine value to readers.\n\n[INSTRUCTIONS]\nWrite a comprehensive article about [TOPIC] that is optimized for SEO while maintaining high readability and engagement. The content should be:\n\n1. Optimized for the keyword "[KEYWORD]"\n2. Minimum [LENGTH] words\n3. Include proper headings (H2, H3) structure\n4. Include bullet points and numbered lists where appropriate\n5. Written in a [TONE] voice\n\nThe article should include:\n- A compelling introduction that hooks the reader\n- In-depth information that demonstrates expertise\n- Practical tips or actionable advice\n- A strong conclusion with a call to action\n\nMake the content valuable enough that readers would want to bookmark it and share it with others.'
            : '[Purchase to view the full prompt content]',
          price: 19.99,
          published: true,
          userId: 'user1',
          categoryId: 'cat1',
          createdAt: new Date('2024-02-15'),
          updatedAt: new Date('2024-02-15'),
          category: {
            id: 'cat1',
            name: 'Writing',
          },
          user: {
            id: 'user1',
            name: 'Emma Davis',
            image: null,
          },
        };
        
        setPrompt(promptData);
        
        // Check purchase status if user is authenticated
        if (status === 'authenticated') {
          try {
            // In a real app, check API
            // const purchasesResponse = await apiClient.get<{ promptId: string }[]>('/purchases');
            // const isPurchased = purchasesResponse.some(purchase => purchase.promptId === id);
            
            // For demo, simulate check
            await new Promise(resolve => setTimeout(resolve, 200));
            // Randomly determine if the user has purchased this prompt (for demo)
            const hasRandomlyPurchased = Math.random() > 0.5;
            setPurchaseStatus(hasRandomlyPurchased ? 'purchased' : 'not_purchased');
          } catch (err) {
            console.error('Failed to check purchase status:', err);
            setPurchaseStatus('not_purchased');
          }
        } else {
          setPurchaseStatus('not_purchased');
        }
      } catch (err) {
        setError('Failed to load prompt details. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPromptData();
  }, [id, status, purchaseStatus]);

  const handlePurchase = async () => {
    if (!session) {
      router.push('/api/auth/signin');
      return;
    }
    
    try {
      await purchasePrompt(id, prompt?.price || 0);
      setPurchaseStatus('purchased');
    } catch (err) {
      // Error is handled by the hook
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading prompt details...</p>
        </div>
      </div>
    );
  }

  if (error || !prompt) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 p-4 rounded-md">
          <h2 className="text-lg font-medium text-red-800 mb-2">Error</h2>
          <p className="text-red-700">{error || 'Prompt not found'}</p>
          <button 
            onClick={() => router.back()} 
            className="mt-4 bg-red-100 text-red-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-200"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const formattedDate = formatDistanceToNow(new Date(prompt.createdAt), { addSuffix: true });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <nav className="mb-6">
          <Link href="/marketplace" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to Marketplace
          </Link>
        </nav>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                  {prompt.category.name}
                </span>
                <span className="text-sm text-gray-500">
                  Created {formattedDate}
                </span>
              </div>
              <span className="text-2xl font-bold text-green-600">
                ${prompt.price.toFixed(2)}
              </span>
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{prompt.title}</h1>
            
            <div className="flex items-center mb-4">
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center mr-2">
                {prompt.user.image ? (
                  <img 
                    src={prompt.user.image} 
                    alt={prompt.user.name} 
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-xs">{prompt.user.name.charAt(0)}</span>
                )}
              </div>
              <span className="text-sm text-gray-600">By {prompt.user.name}</span>
            </div>
            
            <div className="prose max-w-none mb-8">
              <h2 className="text-lg font-semibold mb-2">Description</h2>
              <p className="text-gray-700">{prompt.description}</p>
            </div>
            
            <div className="border-t border-b border-gray-200 py-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Prompt Content</h2>
              {purchaseStatus === 'purchased' ? (
                <div className="bg-gray-50 p-4 rounded-md font-mono text-sm whitespace-pre-wrap">
                  {prompt.content}
                </div>
              ) : (
                <div className="bg-gray-50 p-6 rounded-md border border-dashed border-gray-300 text-center">
                  <p className="text-gray-500 mb-2">Purchase this prompt to view the full content</p>
                  <p className="text-xs text-gray-400 mb-4">
                    You'll gain immediate access to use this prompt with any AI tool
                  </p>
                  {purchaseError && (
                    <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">
                      {purchaseError}
                    </div>
                  )}
                  <button
                    onClick={handlePurchase}
                    disabled={isPurchasing || status === 'loading'}
                    className="w-full sm:w-auto px-6 py-3 rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPurchasing ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Processing...
                      </>
                    ) : (
                      `Purchase for $${prompt.price.toFixed(2)}`
                    )}
                  </button>
                </div>
              )}
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md mb-6">
              <h3 className="text-md font-medium text-blue-800 mb-2">How to use this prompt</h3>
              <ol className="text-sm text-blue-700 space-y-2 pl-5 list-decimal">
                <li>Purchase the prompt to gain full access</li>
                <li>Copy the entire prompt content</li>
                <li>Paste it into your preferred AI assistant (ChatGPT, Claude, etc.)</li>
                <li>Replace any placeholders like [TOPIC] with your specific information</li>
                <li>Submit to the AI and receive your customized result</li>
              </ol>
            </div>
            
            {purchaseStatus === 'purchased' && (
              <div className="bg-green-50 p-4 rounded-md">
                <h3 className="text-md font-medium text-green-800 mb-2">You own this prompt</h3>
                <p className="text-sm text-green-700">
                  You've purchased this prompt and have full access to its content. 
                  You can use it as many times as you'd like with any AI tool.
                </p>
              </div>
            )}
          </div>
          
          {purchaseStatus !== 'purchased' && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={handlePurchase}
                disabled={isPurchasing || status === 'loading' || purchaseStatus === 'checking'}
                className="w-full px-6 py-3 rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPurchasing ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Processing...
                  </>
                ) : purchaseStatus === 'checking' ? (
                  'Checking purchase status...'
                ) : (
                  `Purchase for $${prompt.price.toFixed(2)}`
                )}
              </button>
              {status !== 'authenticated' && (
                <p className="text-center text-xs text-gray-500 mt-2">
                  You'll need to sign in to purchase this prompt
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 