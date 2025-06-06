import React from 'react';

// Basic UI components - simplified for standalone app

export function Button({ children, onClick, disabled, className, variant = "default", ...props }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline';
  [key: string]: any;
}) {
  const baseClasses = "px-4 py-2 rounded-md font-medium transition-colors";
  const variantClasses = variant === 'outline' 
    ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
    : "bg-blue-600 text-white hover:bg-blue-700";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "";
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabledClasses} ${className || ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }: { className?: string; [key: string]: any }) {
  return (
    <input 
      className={`border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className || ''}`}
      {...props} 
    />
  );
}

export function Textarea({ className, ...props }: { className?: string; [key: string]: any }) {
  return (
    <textarea 
      className={`border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className || ''}`}
      {...props} 
    />
  );
}

export function Badge({ children, variant = "default", className }: {
  children: React.ReactNode;
  variant?: 'default' | 'secondary';
  className?: string;
}) {
  const variantClasses = variant === 'secondary' 
    ? "bg-gray-100 text-gray-800"
    : "bg-blue-100 text-blue-800";
    
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses} ${className || ''}`}>
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className || ''}`}>
      {children}
    </div>
  );
}

export function Avatar({ src, fallback, size = "md" }: {
  src?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg"
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gray-300 flex items-center justify-center overflow-hidden`}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium text-gray-600">{fallback}</span>
      )}
    </div>
  );
}

export function VoteButton({ isVoted, voteCount, onVote, className }: {
  isVoted: boolean;
  voteCount: number;
  onVote: () => void;
  className?: string;
}) {
  return (
    <button 
      onClick={onVote}
      className={`flex flex-col items-center p-2 rounded-md transition-colors ${
        isVoted ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      } ${className || ''}`}
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
      </svg>
      <span className="text-sm font-medium">{voteCount}</span>
    </button>
  );
}

export function PromptCard({ 
  id, title, description, model, upvoteCount, isVoted, author, category, createdAt, onVote, onView, onRun 
}: {
  id: string;
  title: string;
  description: string;
  model: string;
  upvoteCount: number;
  isVoted: boolean;
  author: { name: string | null; image: string | null };
  category: { name: string };
  createdAt: Date;
  onVote: (id: string) => void;
  onView: (id: string) => void;
  onRun: (id: string) => void;
}) {
  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 text-sm mb-3">{description}</p>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary">{category.name}</Badge>
            <Badge>{model.toUpperCase()}</Badge>
          </div>
        </div>
        <VoteButton 
          isVoted={isVoted}
          voteCount={upvoteCount}
          onVote={() => onVote(id)}
        />
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar 
            src={author.image || undefined}
            fallback={author.name?.[0] || 'U'}
            size="sm"
          />
          <span className="text-sm text-gray-600">{author.name || 'Anonymous'}</span>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onView(id)}>View</Button>
          <Button onClick={() => onRun(id)}>Run</Button>
        </div>
      </div>
    </Card>
  );
}