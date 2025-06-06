// AI Services
export * from './ai';

// Rate Limiting
export * from './rate-limit';

// Utility functions
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const SUPPORTED_MODELS = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', type: 'text' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI', type: 'text' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'Anthropic', type: 'text' },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', type: 'text' },
] as const;

export type SupportedModel = typeof SUPPORTED_MODELS[number]['id'];