'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { apiClient } from '@/lib/api-client';

export default function CreatePromptPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  
  // Fetch categories when component mounts
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setIsLoadingCategories(true);
        // In a real app, we would fetch from API
        // const response = await apiClient.get<Array<{ id: string; name: string }>>('/categories');
        // setCategories(response);
        
        // For demo, use mock data
        setCategories([
          { id: 'cat1', name: 'Writing' },
          { id: 'cat2', name: 'Programming' },
          { id: 'cat3', name: 'Marketing' },
          { id: 'cat4', name: 'Education' },
          { id: 'cat5', name: 'Design' },
        ]);
      } catch (err) {
        setError('Failed to load categories. Please try again.');
      } finally {
        setIsLoadingCategories(false);
      }
    };
    
    fetchCategories();
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/api/auth/signin');
    }
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title || !description || !content || !price || !categoryId) {
      setError('Please fill in all required fields.');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      // In a real app, we would send to API
      // await apiClient.post('/prompts', {
      //   title,
      //   description,
      //   content,
      //   price: parseFloat(price),
      //   categoryId,
      //   published: true,
      // });
      
      // For demo, just simulate a successful request
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      router.push('/dashboard?tab=created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create prompt. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Create a New Prompt</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-md mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="E.g., Advanced SEO Content Generator"
              required
            />
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Briefly describe your prompt and what it helps users achieve"
              required
            />
          </div>
          
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
              Prompt Content *
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="Your actual prompt text that users will purchase..."
              required
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                Price (USD) *
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="0.99"
                  step="0.01"
                  className="w-full pl-7 pr-12 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="9.99"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Set a fair price between $0.99 and $99.99
              </p>
            </div>
            
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={isLoadingCategories}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Prompt'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 