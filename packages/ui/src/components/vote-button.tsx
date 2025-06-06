'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

export interface VoteButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isVoted?: boolean;
  voteCount: number;
  onVote?: () => void;
}

const VoteButton = React.forwardRef<HTMLButtonElement, VoteButtonProps>(
  ({ className, isVoted = false, voteCount, onVote, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center px-3 py-2 rounded-lg border transition-all duration-200 hover:scale-105',
          isVoted
            ? 'bg-orange-50 border-orange-200 text-orange-600'
            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100',
          className
        )}
        onClick={onVote}
        {...props}
      >
        <svg
          className={cn(
            'w-5 h-5 mb-1',
            isVoted ? 'fill-orange-500' : 'fill-none stroke-current'
          )}
          viewBox="0 0 24 24"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 15l7-7 7 7"
          />
        </svg>
        <span className="text-xs font-medium">{voteCount}</span>
      </button>
    );
  }
);

VoteButton.displayName = 'VoteButton';

export { VoteButton };