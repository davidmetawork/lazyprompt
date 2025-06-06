'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export interface PromptCardProps {
  id: string;
  title: string;
  description: string;
  price: number;
  category: {
    id: string;
    name: string;
  };
  author: {
    id?: string;
    name: string;
    image?: string | null;
  };
  createdAt: Date;
}

export function PromptCard({
  id,
  title,
  description,
  price,
  category,
  author,
  createdAt,
}: PromptCardProps) {
  const formattedDate = formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {category.name}
          </span>
          <span className="text-lg font-bold text-green-600">${price.toFixed(2)}</span>
        </div>
        
        <Link href={`/prompt/${id}`} className="block">
          <h3 className="text-lg font-semibold text-gray-900 mb-1 hover:text-blue-600 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-gray-500 line-clamp-2 mb-4">
            {description}
          </p>
        </Link>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center">
            <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center mr-2">
              {author.image ? (
                <img 
                  src={author.image} 
                  alt={author.name} 
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs">{author.name.charAt(0)}</span>
              )}
            </div>
            <span>{author.name}</span>
          </div>
          <span>{formattedDate}</span>
        </div>
      </div>
      
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
        <Link
          href={`/prompt/${id}`}
          className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          View Details
        </Link>
      </div>
    </div>
  );
} 