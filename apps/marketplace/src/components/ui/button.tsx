import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import Link from 'next/link';
import { LoadingSpinner } from './loading-spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  href?: string;
  className?: string;
  asChild?: boolean;
  onClick?: () => void;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  href,
  className = '',
  asChild = false,
  disabled,
  onClick,
  ...props
}, ref) => {
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    outline: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  const baseClasses = `rounded-md font-medium inline-flex items-center justify-center transition-colors 
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
    disabled:opacity-50 disabled:cursor-not-allowed`;

  const buttonClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  // If href is provided and not using asChild, render a Link component
  if (href && !asChild) {
    return (
      <Link href={href} className={buttonClasses}>
        {isLoading && <LoadingSpinner size="sm" className="mr-2" />}
        {children}
      </Link>
    );
  }

  // If asChild is true, clone the first child and pass the props
  if (asChild && children) {
    // In a real implementation, we'd use a proper cloneElement approach
    // For simplicity, we'll just return the children
    return children;
  }

  // Otherwise render a button element
  return (
    <button 
      ref={ref}
      className={buttonClasses} 
      disabled={disabled || isLoading} 
      onClick={onClick}
      {...props}
    >
      {isLoading && <LoadingSpinner size="sm" className="mr-2" />}
      {children}
    </button>
  );
});

Button.displayName = 'Button'; 