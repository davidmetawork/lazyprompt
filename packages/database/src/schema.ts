import { Prompt, Category, Purchase, User, Vote } from '@prisma/client';
import { z } from 'zod';

export type PromptWithRelations = Prompt & {
  category: Category;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
};

export type PurchaseWithRelations = Purchase & {
  prompt: PromptWithRelations;
};

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdPrompts: number;
  purchasedPrompts: number;
};

// User schema
export const userSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email().nullable(),
  emailVerified: z.date().nullable(),
  image: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Category schema
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Prompt schema
export const promptSchema = z.object({
  id: z.string(),
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  content: z.string().min(10),
  model: z.string().min(1), // AI model (e.g., "gpt-4", "claude", "stable-diffusion")
  price: z.number().min(0).default(0), // Allow free prompts
  published: z.boolean().default(true),
  upvoteCount: z.number().default(0),
  userId: z.string(),
  categoryId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Purchase schema
export const purchaseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  promptId: z.string(),
  price: z.number(),
  createdAt: z.date(),
});

// Vote schema
export const voteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  promptId: z.string(),
  value: z.number().default(1), // 1 for upvote, -1 for downvote
  createdAt: z.date(),
});

// Create prompt input schema
export const createPromptSchema = promptSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
});

// Update prompt input schema
export const updatePromptSchema = createPromptSchema.partial();

// Create purchase input schema
export const createPurchaseSchema = z.object({
  promptId: z.string(),
  price: z.number(),
});

// Create vote input schema
export const createVoteSchema = z.object({
  promptId: z.string(),
  value: z.number().min(-1).max(1).default(1), // -1 downvote, 1 upvote
});

// Update user profile schema
export const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// Export types
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