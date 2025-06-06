'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCategories } from '@/hooks/use-categories';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories, isLoading: categoriesLoading } = useCategories();
  
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('categoryId') || '';
  
  const [search, setSearch] = useState(initialSearch);
  const [categoryId, setCategoryId] = useState(initialCategory);
  
  // Debounced search handler to prevent excessive URL updates
  const debouncedSearch = useCallback(
    debounce((search: string, categoryId: string) => {
      const params = new URLSearchParams();
      
      if (search) {
        params.set('search', search);
      }
      
      if (categoryId) {
        params.set('categoryId', categoryId);
      }
      
      // Reset to page 1 when search criteria change
      params.set('page', '1');
      
      // Update the URL with the search parameters
      const newUrl = `/marketplace${params.toString() ? `?${params.toString()}` : ''}`;
      router.push(newUrl);
    }, 500),
    [router]
  );
  
  // Handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };
  
  // Handle category filter changes
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategoryId(e.target.value);
  };
  
  // Perform search when inputs change
  useEffect(() => {
    debouncedSearch(search, categoryId);
  }, [search, categoryId, debouncedSearch]);
  
  return (
    <div className="w-full bg-white p-4 mb-6 rounded-lg shadow-sm border">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
            Search Prompts
          </label>
          <input
            type="text"
            id="search"
            name="search"
            placeholder="Search by title or description..."
            value={search}
            onChange={handleSearchChange}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        
        <div className="md:w-64">
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <div className="relative">
            {categoriesLoading ? (
              <div className="absolute right-3 top-1/2 -mt-2">
                <LoadingSpinner size="sm" />
              </div>
            ) : null}
            <select
              id="category"
              name="category"
              value={categoryId}
              onChange={handleCategoryChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={categoriesLoading}
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// Utility function for debouncing function calls
function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
} 