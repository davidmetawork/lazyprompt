import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIProvider {
  execute(prompt: string): Promise<AIResponse>;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async execute(prompt: string): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || '';
      
      return {
        content,
        model: this.model,
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-sonnet-20240229') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async execute(prompt: string): Promise<AIResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      
      return {
        content,
        model: this.model,
        usage: response.usage ? {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        } : undefined,
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class AIService {
  private providers: Map<string, AIProvider> = new Map();

  addProvider(name: string, provider: AIProvider) {
    this.providers.set(name, provider);
  }

  async executePrompt(modelName: string, prompt: string): Promise<AIResponse> {
    const provider = this.providers.get(modelName);
    if (!provider) {
      throw new Error(`No provider found for model: ${modelName}`);
    }

    return provider.execute(prompt);
  }

  getAvailableModels(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Factory function to create a configured AI service
export function createAIService(): AIService {
  const service = new AIService();

  // Add OpenAI providers if API key is available
  if (process.env.OPENAI_API_KEY) {
    service.addProvider('gpt-4', new OpenAIProvider(process.env.OPENAI_API_KEY, 'gpt-4'));
    service.addProvider('gpt-3.5-turbo', new OpenAIProvider(process.env.OPENAI_API_KEY, 'gpt-3.5-turbo'));
  }

  // Add Anthropic providers if API key is available
  if (process.env.ANTHROPIC_API_KEY) {
    service.addProvider('claude-3-sonnet', new AnthropicProvider(process.env.ANTHROPIC_API_KEY, 'claude-3-sonnet-20240229'));
    service.addProvider('claude-3-haiku', new AnthropicProvider(process.env.ANTHROPIC_API_KEY, 'claude-3-haiku-20240307'));
  }

  return service;
}