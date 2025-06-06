'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PromptCard, Badge, Button, Input } from '@/components/ui';
import { useSession } from 'next-auth/react';

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

export default function MarketplaceContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('categoryId') || '');
  const [selectedModel, setSelectedModel] = useState(searchParams.get('model') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'trending');

  // Mock data for now since API is disabled
  useEffect(() => {
    setLoading(false);
    setPrompts([]);
    setCategories([]);
  }, [searchQuery, selectedCategory, selectedModel, sortBy]);

  // Handle voting
  const handleVote = async (promptId: string) => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    // Mock implementation
    console.log('Vote for prompt:', promptId);
  };

  // Handle prompt view
  const handleView = (promptId: string) => {
    router.push(`/marketplace/${promptId}`);
  };

  // Handle prompt run
  const handleRun = (promptId: string) => {
    router.push(`/marketplace/${promptId}?action=run`);
  };

  const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-sonnet', 'claude-3-haiku'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover AI Prompts</h1>
        <p className="text-gray-600">Find and run the best prompts from our community</p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        {/* Search Bar */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Button onClick={() => console.log('Search')}>Search</Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="trending">Trending</option>
            <option value="newest">Newest</option>
            <option value="votes">Most Voted</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category._count.prompts})
              </option>
            ))}
          </select>

          {/* Model Filter */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Models</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 h-48 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No prompts found</h3>
          <p className="text-gray-500 mb-4">Database functionality will be added after initial deployment</p>
          <Button onClick={() => {
            setSearchQuery('');
            setSelectedCategory('');
            setSelectedModel('');
            setSortBy('trending');
          }}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              id={prompt.id}
              title={prompt.title}
              description={prompt.description}
              model={prompt.model}
              upvoteCount={prompt.upvoteCount}
              isVoted={prompt.isVoted}
              author={prompt.author}
              category={prompt.category}
              createdAt={new Date(prompt.createdAt)}
              onVote={handleVote}
              onView={handleView}
              onRun={handleRun}
            />
          ))}
        </div>
      )}
    </div>
  );
} 