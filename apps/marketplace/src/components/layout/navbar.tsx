'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Marketplace', href: '/marketplace' },
  ];

  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-blue-600">
                LazyPrompt
              </Link>
            </div>
            <nav className="hidden sm:ml-6 sm:flex sm:space-x-8" aria-label="Main navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${
                    isActive(link.href)
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {status === 'authenticated' ? (
              <div className="flex items-center">
                <Link
                  href="/dashboard"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    isActive('/dashboard')
                      ? 'text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Dashboard
                </Link>
                <span className="mx-2 h-4 w-0.5 bg-gray-200" />
                <button
                  onClick={() => signOut()}
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => signIn()}
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Sign In
                </button>
                <Link
                  href="/api/auth/signin"
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          <div className="-mr-2 flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
              aria-expanded="false"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {/* Icon when menu is closed */}
              <svg
                className={`${mobileMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              {/* Icon when menu is open */}
              <svg
                className={`${mobileMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${mobileMenuOpen ? 'block' : 'hidden'} sm:hidden`}>
        <div className="space-y-1 pb-3 pt-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block border-l-4 py-2 pl-3 pr-4 text-base font-medium ${
                isActive(link.href)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              {link.name}
            </Link>
          ))}
          
          {status === 'authenticated' && (
            <Link
              href="/dashboard"
              className={`block border-l-4 py-2 pl-3 pr-4 text-base font-medium ${
                isActive('/dashboard')
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              Dashboard
            </Link>
          )}
        </div>
        <div className="border-t border-gray-200 pb-3 pt-4">
          {status === 'authenticated' ? (
            <div className="flex items-center px-4">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
                  {session?.user?.name ? session.user.name.charAt(0) : '?'}
                </div>
              </div>
              <div className="ml-3">
                <div className="text-base font-medium text-gray-800">
                  {session?.user?.name}
                </div>
                <div className="text-sm font-medium text-gray-500">
                  {session?.user?.email}
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="ml-auto flex-shrink-0 rounded-md bg-white p-2 text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-1 px-2">
              <button
                onClick={() => signIn()}
                className="block w-full rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                Sign In
              </button>
              <Link
                href="/api/auth/signin"
                className="block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-base font-medium text-white hover:bg-blue-700"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
} 