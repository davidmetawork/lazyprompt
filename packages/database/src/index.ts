import { PrismaClient, Prisma } from '@prisma/client';

// Export all from Prisma client but don't re-export from schema
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
// Export specific named exports from schema instead of '*'
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

// Export types from schema
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

// Types with relations from schema
export type {
  PromptWithRelations as SchemaPromptWithRelations,
  PurchaseWithRelations as SchemaPurchaseWithRelations,
  UserProfile as SchemaUserProfile
} from './schema';

// Extended types for use in the application
export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  purchasedPrompts: number;
  createdPrompts: number;
};

// Types with relations included
export type PromptWithRelations = Prisma.PromptGetPayload<{
  include: {
    category: true;
    user: {
      select: {
        id: true;
        name: true;
        image: true;
      };
    };
  };
}>;

export type PurchaseWithRelations = Prisma.PurchaseGetPayload<{
  include: {
    prompt: {
      include: {
        category: true;
        user: {
          select: {
            id: true;
            name: true;
            image: true;
          };
        };
      };
    };
  };
}>;

export type CategoryWithPromptCount = Prisma.CategoryGetPayload<{
  include: {
    _count: {
      select: {
        prompts: true;
      };
    };
  };
}>; 