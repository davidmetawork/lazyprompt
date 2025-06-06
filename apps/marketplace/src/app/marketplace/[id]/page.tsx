'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Badge, Button, VoteButton, Avatar, Textarea, Card } from '@/components/ui';
import { formatTimeAgo } from '@/lib/utils';

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
  published: boolean;
}

interface AIResponse {
  success: boolean;
  output: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  rateLimitInfo?: {
    remaining: number;
    reset: Date;
  };
}

export default function PromptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const promptId = params.id as string;
  const autoRun = searchParams.get('action') === 'run';

  // Fetch prompt details
  useEffect(() => {
    const fetchPrompt = async () => {
      try {
        const response = await fetch(`/api/prompts/${promptId}`);
        if (response.ok) {
          const data = await response.json();
          setPrompt(data);
        } else if (response.status === 404) {
          setError('Prompt not found');
        } else {
          setError('Failed to load prompt');
        }
      } catch (err) {
        setError('Failed to load prompt');
      } finally {
        setLoading(false);
      }
    };

    fetchPrompt();
  }, [promptId]);

  // Handle voting
  const handleVote = async () => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${promptId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 1 })
      });

      if (response.ok) {
        const updatedPrompt = await response.json();
        setPrompt(prev => prev ? {
          ...prev,
          upvoteCount: updatedPrompt.upvoteCount,
          isVoted: updatedPrompt.isVoted
        } : null);
      }
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  // Handle running the prompt
  const handleRun = async () => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    setRunning(true);
    setAiResponse(null);
    setError(null);

    try {
      const response = await fetch(`/api/prompts/${promptId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: userInput })
      });

      const data = await response.json();

      if (response.ok) {
        setAiResponse(data);
      } else {
        setError(data.error || 'Failed to run prompt');
      }
    } catch (err) {
      setError('Failed to run prompt');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="h-48 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (error || !prompt) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {error || 'Prompt Not Found'}
        </h1>
        <p className="text-gray-600 mb-8">
          The prompt you're looking for doesn't exist or has been removed.
        </p>
        <Link href="/marketplace">
          <Button>Back to Marketplace</Button>
        </Link>
      </div>
    );
  }

  const hasInputPlaceholders = prompt.content.includes('{{input}}') || 
                              prompt.content.includes('{{user_input}}') ||
                              prompt.content.includes('[') && prompt.content.includes(']');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link 
        href="/marketplace" 
        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-6"
      >
        ← Back to Marketplace
      </Link>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{prompt.title}</h1>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{prompt.category.name}</Badge>
                  <Badge variant="default">{prompt.model.toUpperCase()}</Badge>
                  <span className="text-sm text-gray-500">
                    {formatTimeAgo(new Date(prompt.createdAt))}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
              <p className="text-gray-700">{prompt.description}</p>
            </div>

            {/* Prompt Content */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Prompt</h2>
              <div className="bg-gray-50 p-4 rounded-lg border">
                <pre className="text-gray-700 whitespace-pre-wrap font-mono text-sm">
                  {prompt.content}
                </pre>
              </div>
            </div>

            {/* Input Section */}
            {hasInputPlaceholders && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Your Input</h2>
                <Textarea
                  placeholder="Enter your input here (will replace placeholders in the prompt)..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  rows={4}
                  className="w-full"
                />
              </div>
            )}

            {/* Run Button */}
            <div className="mb-6">
              <Button 
                onClick={handleRun} 
                disabled={running || !session}
                className="w-full sm:w-auto"
              >
                {running ? 'Running...' : 'Run Prompt'}
              </Button>
              {!session && (
                <p className="text-sm text-gray-500 mt-2">
                  <Link href="/auth/signin" className="text-blue-600 hover:underline">
                    Sign in
                  </Link> to run this prompt
                </p>
              )}
            </div>

            {/* AI Response */}
            {aiResponse && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Response</h2>
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="default">{aiResponse.model}</Badge>
                    {aiResponse.usage && (
                      <span className="text-xs text-gray-500">
                        {aiResponse.usage.total_tokens} tokens
                      </span>
                    )}
                  </div>
                  <div className="prose max-w-none">
                    <pre className="whitespace-pre-wrap text-gray-800 font-sans">
                      {aiResponse.output}
                    </pre>
                  </div>
                </Card>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-6">
                <Card className="p-4 bg-red-50 border-red-200">
                  <p className="text-red-800">{error}</p>
                </Card>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-6">
            {/* Vote Section */}
            <div className="mb-6 text-center">
              <VoteButton
                isVoted={prompt.isVoted}
                voteCount={prompt.upvoteCount}
                onVote={handleVote}
                className="mx-auto"
              />
            </div>

            {/* Author */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Created by</h3>
              <div className="flex items-center gap-3">
                <Avatar
                  src={prompt.author.image || undefined}
                  fallback={prompt.author.name?.[0] || 'U'}
                  size="md"
                />
                <div>
                  <p className="font-medium text-gray-900">
                    {prompt.author.name || 'Anonymous'}
                  </p>
                  <p className="text-sm text-gray-500">Creator</p>
                </div>
              </div>
            </div>

            {/* Model Info */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Compatible Model</h3>
              <Badge variant="default" className="w-full justify-center py-2">
                {prompt.model.toUpperCase()}
              </Badge>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(prompt.content);
                }}
              >
                Copy Prompt
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  const url = window.location.href;
                  navigator.clipboard.writeText(url);
                }}
              >
                Share
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
} 