import { ApiResponse } from './api-response';

/**
 * API client for making requests to our backend
 */

// Utility function to get the base URL for API requests
const getBaseUrl = () => {
  // In the browser, we use relative URLs
  if (typeof window !== 'undefined') return '';
  
  // When rendering on the server, we need to use the full URL
  // This needs to be updated when deploying to production
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
};

// Error class for API errors
export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// Main API client object with methods for different HTTP verbs
export const apiClient = {
  /**
   * Make a GET request to the API
   * @param path - The API endpoint path
   * @returns The JSON response data
   */
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${getBaseUrl()}/api${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(error.message || 'Failed to fetch data', res.status);
    }
    
    return res.json();
  },
  
  /**
   * Make a POST request to the API
   * @param path - The API endpoint path
   * @param data - The data to send in the request body
   * @returns The JSON response data
   */
  async post<T>(path: string, data: any): Promise<T> {
    const res = await fetch(`${getBaseUrl()}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(error.message || 'Failed to post data', res.status);
    }
    
    return res.json();
  },
  
  /**
   * Make a PUT request to the API
   * @param path - The API endpoint path
   * @param data - The data to send in the request body
   * @returns The JSON response data
   */
  async put<T>(path: string, data: any): Promise<T> {
    const res = await fetch(`${getBaseUrl()}/api${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(error.message || 'Failed to update data', res.status);
    }
    
    return res.json();
  },
  
  /**
   * Make a DELETE request to the API
   * @param path - The API endpoint path
   * @returns The JSON response data
   */
  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${getBaseUrl()}/api${path}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(error.message || 'Failed to delete data', res.status);
    }
    
    return res.json();
  },
}; 