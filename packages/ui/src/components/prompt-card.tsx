'use client';

import * as React from 'react';
import { cn } from '../lib/cn';
import { Card } from './card';
import { Badge } from './badge';
import { Avatar } from './avatar';
import { VoteButton } from './vote-button';

export interface PromptCardProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  title: string;
  description: string;
  model: string;
  upvoteCount: number;
  isVoted?: boolean;
  author: {
    name: string | null;
    image: string | null;
  };
  category: {
    name: string;
  };
  createdAt: Date;
  onVote?: (promptId: string) => void;
  onView?: (promptId: string) => void;
  onRun?: (promptId: string) => void;
}

const PromptCard = React.forwardRef<HTMLDivElement, PromptCardProps>(
  ({
    className,
    id,
    title,
    description,
    model,
    upvoteCount,
    isVoted = false,
    author,
    category,
    createdAt,
    onVote,
    onView,
    onRun,
    ...props
  }, ref) => {
    const timeAgo = React.useMemo(() => {
      const now = new Date();
      const diff = now.getTime() - createdAt.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return 'just now';
    }, [createdAt]);

    const getModelColor = (model: string) => {
      if (model.includes('gpt')) return 'success';
      if (model.includes('claude')) return 'warning';
      if (model.includes('stable') || model.includes('midjourney')) return 'secondary';
      return 'default';
    };

    return (
      <Card
        ref={ref}
        className={cn(
          'p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500',
          className
        )}
        onClick={() => onView?.(id)}
        {...props}
      >
        <div className="flex items-start gap-4">
          <VoteButton
            isVoted={isVoted}
            voteCount={upvoteCount}
            onVote={(e) => {
              e.stopPropagation();
              onVote?.(id);
            }}
          />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-lg text-gray-900 leading-tight">
                {title}
              </h3>
              <div className="flex gap-2 shrink-0">
                <Badge variant={getModelColor(model) as any} className="text-xs">
                  {model.toUpperCase()}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {category.name}
                </Badge>
              </div>
            </div>
            
            <p className="text-gray-600 text-sm mb-3 line-clamp-2">
              {description}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar
                  src={author.image || undefined}
                  fallback={author.name?.[0] || 'U'}
                  size="sm"
                />
                <div className="text-sm text-gray-500">
                  <span className="font-medium">{author.name || 'Anonymous'}</span>
                  <span className="mx-1">•</span>
                  <span>{timeAgo}</span>
                </div>
              </div>
              
              <button
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun?.(id);
                }}
              >
                Run Prompt
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  }
);

PromptCard.displayName = 'PromptCard';

export { PromptCard };