import { PrismaClient } from '@prisma/client';

// Export all from Prisma client
export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from './prisma';

// Export schemas and types
export {
  userSchema,
  categorySchema,
  promptSchema,
  purchaseSchema,
  voteSchema,
  createPromptSchema,
  updatePromptSchema,
  createPurchaseSchema,
  createVoteSchema,
  updateUserProfileSchema,
} from './schema';

export type {
  UserSchema,
  CategorySchema,
  PromptSchema,
  PurchaseSchema,
  VoteSchema,
  CreatePromptInput,
  UpdatePromptInput,
  CreatePurchaseInput,
  CreateVoteInput,
  UpdateUserProfileInput
} from './schema';

// Basic user profile type
export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  purchasedPrompts: number;
  createdPrompts: number;
}; 