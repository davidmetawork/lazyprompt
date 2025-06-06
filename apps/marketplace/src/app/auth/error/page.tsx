'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  useEffect(() => {
    const error = searchParams.get('error');
    
    // Map error codes to user-friendly messages
    const errorMessages: Record<string, string> = {
      'Configuration': 'There is a problem with the server configuration. Please try again later.',
      'AccessDenied': 'Access denied. You do not have permission to sign in.',
      'Verification': 'The verification link may have expired or already been used.',
      'OAuthSignin': 'Error in the OAuth sign-in process. Please try again.',
      'OAuthCallback': 'Error during OAuth callback. Please try again.',
      'OAuthCreateAccount': 'Could not create an OAuth account. An account may already exist.',
      'EmailCreateAccount': 'Could not create an email account. An account may already exist.',
      'Callback': 'Error during the callback process. Please try again.',
      'Default': 'An error occurred during authentication. Please try again.'
    };
    
    setErrorMessage(error ? (errorMessages[error] || errorMessages.Default) : errorMessages.Default);
  }, [searchParams]);

  return (
    <div className="container flex items-center justify-center min-h-[80vh] py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center text-red-600">Authentication Error</h1>
        </CardHeader>
        
        <CardContent>
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            </div>
          </div>
          
          <p className="text-gray-600 text-center mb-4">
            Please try signing in again or contact support if the problem persists.
          </p>
        </CardContent>
        
        <CardFooter className="flex justify-center space-x-4">
          <Button variant="outline" asChild>
            <Link href="/">Return to Home</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/signin">Try Again</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 