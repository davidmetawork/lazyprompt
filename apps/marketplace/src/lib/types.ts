// Local type definitions to replace @lazyprompt/database types

export interface UserProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  bio?: string | null;
  website?: string | null;
  twitter?: string | null;
  github?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  price: number;
  category: string;
  tags: string[];
  authorId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptWithRelations extends Prompt {
  author: UserProfile;
  purchases?: Purchase[];
  votes?: Vote[];
  _count?: {
    purchases: number;
    votes: number;
  };
}

export interface Purchase {
  id: string;
  userId: string;
  promptId: string;
  amount: number;
  createdAt: Date;
}

export interface PurchaseWithRelations extends Purchase {
  user: UserProfile;
  prompt: Prompt;
}

export interface Vote {
  id: string;
  userId: string;
  promptId: string;
  type: 'UP' | 'DOWN';
  createdAt: Date;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
} 