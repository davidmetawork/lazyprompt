'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export function Pagination({ currentPage, totalPages, totalItems }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Don't render pagination if only 1 page
  if (totalPages <= 1) {
    return null;
  }
  
  // Create array of page numbers to show (show 5 pages max)
  const getPageNumbers = () => {
    const pageNumbers = [];
    
    // Always include the first page
    pageNumbers.push(1);
    
    // Add the current page and pages around it
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pageNumbers.push(i);
    }
    
    // Always include the last page if more than 1 page
    if (totalPages > 1) {
      pageNumbers.push(totalPages);
    }
    
    // Remove duplicates and sort
    return [...new Set(pageNumbers)].sort((a, b) => a - b);
  };
  
  const pageNumbers = getPageNumbers();
  
  // Helper to create URL with updated page
  const createPageUrl = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    return `/marketplace?${params.toString()}`;
  };
  
  return (
    <div className="flex items-center justify-between mt-8">
      <div className="text-sm text-gray-700">
        Showing <span className="font-medium">{Math.min(1 + (currentPage - 1) * 12, totalItems)}</span> to{' '}
        <span className="font-medium">{Math.min(currentPage * 12, totalItems)}</span> of{' '}
        <span className="font-medium">{totalItems}</span> results
      </div>
      
      <nav className="inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
        {/* Previous page button */}
        {currentPage > 1 ? (
          <Link
            href={createPageUrl(currentPage - 1)}
            className="inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50"
          >
            <span className="sr-only">Previous</span>
            <svg
              className="w-5 h-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        ) : (
          <span className="inline-flex items-center px-2 py-2 text-sm font-medium text-gray-300 bg-white border border-gray-300 rounded-l-md cursor-not-allowed">
            <span className="sr-only">Previous</span>
            <svg
              className="w-5 h-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}

        {/* Page numbers */}
        {pageNumbers.map((page, i) => {
          // Add ellipsis if there's a gap in page numbers
          const prevPage = pageNumbers[i - 1];
          const showEllipsis = prevPage && page - prevPage > 1;
          
          return (
            <div key={page}>
              {showEllipsis && (
                <span className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300">
                  ...
                </span>
              )}
              <Link
                href={createPageUrl(page)}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium ${
                  currentPage === page
                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                } border`}
                aria-current={currentPage === page ? 'page' : undefined}
              >
                {page}
              </Link>
            </div>
          );
        })}

        {/* Next page button */}
        {currentPage < totalPages ? (
          <Link
            href={createPageUrl(currentPage + 1)}
            className="inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50"
          >
            <span className="sr-only">Next</span>
            <svg
              className="w-5 h-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        ) : (
          <span className="inline-flex items-center px-2 py-2 text-sm font-medium text-gray-300 bg-white border border-gray-300 rounded-r-md cursor-not-allowed">
            <span className="sr-only">Next</span>
            <svg
              className="w-5 h-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
      </nav>
    </div>
  );
} 