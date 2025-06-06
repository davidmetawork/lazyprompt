// Form validation utility functions

/**
 * Validates if a field is required (not empty)
 * @param value - The value to check
 * @returns An error message if validation fails, undefined otherwise
 */
export function validateRequired(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') {
    return 'This field is required';
  }
  return undefined;
}

/**
 * Validates if a field is a valid email address
 * @param value - The email to validate
 * @returns An error message if validation fails, undefined otherwise
 */
export function validateEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return 'Please enter a valid email address';
  }
  return undefined;
}

/**
 * Validates if a number field is within a specified range
 * @param value - The number value to validate
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns An error message if validation fails, undefined otherwise
 */
export function validateNumberRange(
  value: number | string | undefined,
  min: number,
  max: number
): string | undefined {
  if (value === undefined || value === '') return undefined;
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return 'Please enter a valid number';
  }
  
  if (numValue < min) {
    return `Value must be at least ${min}`;
  }
  
  if (numValue > max) {
    return `Value must be no more than ${max}`;
  }
  
  return undefined;
}

/**
 * Validates if a field has a minimum length
 * @param value - The string to check
 * @param minLength - The minimum allowed length
 * @returns An error message if validation fails, undefined otherwise
 */
export function validateMinLength(
  value: string | undefined,
  minLength: number
): string | undefined {
  if (!value) return undefined;
  
  if (value.length < minLength) {
    return `Must be at least ${minLength} characters`;
  }
  
  return undefined;
}

/**
 * Validates if a field has a maximum length
 * @param value - The string to check
 * @param maxLength - The maximum allowed length
 * @returns An error message if validation fails, undefined otherwise
 */
export function validateMaxLength(
  value: string | undefined,
  maxLength: number
): string | undefined {
  if (!value) return undefined;
  
  if (value.length > maxLength) {
    return `Must be no more than ${maxLength} characters`;
  }
  
  return undefined;
}

/**
 * Combines multiple validators together
 * @param validators - Array of validation functions to apply
 * @returns The first error message found, or undefined if all validations pass
 */
export function combineValidators(
  ...validators: ((value: any) => string | undefined)[]
) {
  return (value: any): string | undefined => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) {
        return error;
      }
    }
    return undefined;
  };
} 