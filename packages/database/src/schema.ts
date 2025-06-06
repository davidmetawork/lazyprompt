import { z } from 'zod';

// Zod schemas for validation
export const userSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  image: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const promptSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  content: z.string(),
  price: z.number(),
  categoryId: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const purchaseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  promptId: z.string(),
  price: z.number(),
  createdAt: z.date(),
});

export const voteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  promptId: z.string(),
  type: z.enum(['UP', 'DOWN']),
  createdAt: z.date(),
});

// Input schemas for API operations
export const createPromptSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  content: z.string().min(1, 'Content is required'),
  price: z.number().min(0, 'Price must be non-negative'),
  categoryId: z.string().min(1, 'Category is required'),
});

export const updatePromptSchema = createPromptSchema.partial();

export const createPurchaseSchema = z.object({
  promptId: z.string().min(1, 'Prompt ID is required'),
});

export const createVoteSchema = z.object({
  promptId: z.string().min(1, 'Prompt ID is required'),
  type: z.enum(['UP', 'DOWN']),
});

export const updateUserProfileSchema = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
});

// Type exports
export type UserSchema = z.infer<typeof userSchema>;
export type CategorySchema = z.infer<typeof categorySchema>;
export type PromptSchema = z.infer<typeof promptSchema>;
export type PurchaseSchema = z.infer<typeof purchaseSchema>;
export type VoteSchema = z.infer<typeof voteSchema>;

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreateVoteInput = z.infer<typeof createVoteSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>; 