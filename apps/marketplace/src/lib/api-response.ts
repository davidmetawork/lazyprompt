import { NextResponse } from 'next/server';

/**
 * Standardized API response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Function to create a successful API response
 * @param data - The data to include in the response
 * @returns A formatted successful API response
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Function to create an error API response
 * @param error - The error message to include in the response
 * @returns A formatted error API response
 */
export function createErrorResponse(error: string): ApiResponse {
  return {
    success: false,
    error,
  };
}

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    { success: true, data },
    { status }
  );
}

export function errorResponse(error: string, status = 400) {
  return NextResponse.json<ApiResponse<null>>(
    { success: false, error },
    { status }
  );
} 