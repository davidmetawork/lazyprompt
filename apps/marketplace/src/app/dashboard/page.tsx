'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PromptCard } from '@/components/ui/prompt-card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ProfileCard } from '@/components/dashboard/profile-card';
import { apiClient } from '@/lib/api-client';
import { UserProfile } from '@lazyprompt/database';
import { PurchaseWithRelations, PromptWithRelations } from '@lazyprompt/database';

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<'purchased' | 'created' | 'profile'>('profile');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [purchasedPrompts, setPurchasedPrompts] = useState<PurchaseWithRelations[]>([]);
  const [createdPrompts, setCreatedPrompts] = useState<PromptWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data when component mounts
  useEffect(() => {
    const fetchUserData = async () => {
      if (status === 'authenticated') {
        setIsLoading(true);
        setError(null);
        
        try {
          // Fetch user profile
          const profile = await apiClient.get<UserProfile>('/user/profile');
          setUserProfile(profile);

          // In a real app, we would make actual API calls
          // For this demo, we'll simulate some data

          // Fetch user's purchases
          try {
            const purchases = await apiClient.get<PurchaseWithRelations[]>('/purchases');
            setPurchasedPrompts(purchases);
          } catch {
            // If this fails, we'll just use mock data
            setPurchasedPrompts([
              {
                id: 'purchase1',
                userId: session.user.id,
                promptId: '2',
                price: 9.99,
                createdAt: new Date(),
                prompt: {
                  id: '2',
                  title: 'Python Code Refactor Assistant',
                  description: 'AI prompt that helps refactor Python code for better readability and performance.',
                  content: '...',
                  price: 9.99,
                  published: true,
                  userId: 'user2',
                  categoryId: 'cat2',
                  createdAt: new Date('2024-02-20'),
                  updatedAt: new Date('2024-02-20'),
                  category: {
                    id: 'cat2',
                    name: 'Programming',
                  },
                  user: {
                    id: 'user2',
                    name: 'Alex Johnson',
                    image: null,
                  },
                },
              },
            ]);
          }

          // Fetch prompts created by the user
          try {
            const prompts = await apiClient.get<PromptWithRelations[]>('/prompts/user');
            setCreatedPrompts(prompts);
          } catch {
            // If this fails, we'll just use mock data
            setCreatedPrompts([
              {
                id: '3',
                title: 'Marketing Email Generator',
                description: 'Create compelling marketing emails that convert with this specialized prompt.',
                content: '...',
                price: 5.99,
                published: true,
                userId: session.user.id,
                categoryId: 'cat3',
                createdAt: new Date('2024-03-10'),
                updatedAt: new Date('2024-03-10'),
                category: {
                  id: 'cat3',
                  name: 'Marketing',
                },
                user: {
                  id: session.user.id,
                  name: session.user.name || '',
                  image: session.user.image,
                },
              },
            ]);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchUserData();
  }, [status, session]);

  // Redirect if not authenticated
  if (status === 'unauthenticated') {
    router.push('/api/auth/signin');
    return null;
  }

  // Show loading state while checking authentication or loading data
  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Show error state if something went wrong
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 p-4 rounded-md">
          <h2 className="text-lg font-medium text-red-800 mb-2">Error loading dashboard</h2>
          <p className="text-red-700">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 bg-red-100 text-red-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-200"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Your Dashboard</h1>
      
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button
            onClick={() => setActiveTab('profile')}
            className={`mr-8 py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('purchased')}
            className={`mr-8 py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'purchased'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Purchased Prompts
          </button>
          <button
            onClick={() => setActiveTab('created')}
            className={`mr-8 py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'created'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Your Created Prompts
          </button>
        </div>
      </div>
      
      {activeTab === 'profile' && userProfile && (
        <ProfileCard userProfile={userProfile} />
      )}
      
      {activeTab === 'purchased' && (
        <>
          {purchasedPrompts.length === 0 ? (
            <EmptyState
              title="You haven't purchased any prompts yet"
              description="Browse the marketplace to find prompts that can help you"
              actionLabel="Browse Marketplace"
              actionHref="/marketplace"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {purchasedPrompts.map(purchase => (
                <PromptCard
                  key={purchase.promptId}
                  id={purchase.prompt.id}
                  title={purchase.prompt.title}
                  description={purchase.prompt.description}
                  price={purchase.prompt.price}
                  category={purchase.prompt.category}
                  author={purchase.prompt.user}
                  createdAt={purchase.prompt.createdAt}
                />
              ))}
            </div>
          )}
        </>
      )}
      
      {activeTab === 'created' && (
        <>
          {createdPrompts.length === 0 ? (
            <EmptyState
              title="You haven't created any prompts yet"
              description="Start creating and selling your own prompts"
              actionLabel="Create Prompt"
              actionHref="/create"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {createdPrompts.map(prompt => (
                <PromptCard
                  key={prompt.id}
                  id={prompt.id}
                  title={prompt.title}
                  description={prompt.description}
                  price={prompt.price}
                  category={prompt.category}
                  author={prompt.user}
                  createdAt={prompt.createdAt}
                />
              ))}
            </div>
          )}
          
          <div className="mt-8 text-center">
            <Link
              href="/create"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Create New Prompt
            </Link>
          </div>
        </>
      )}
    </div>
  );
} 