import { NextResponse } from 'next/server';
import { prisma } from '@lazyprompt/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createAIService, createRateLimitService } from '@lazyprompt/core';

// POST: Execute a prompt with AI
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to run prompts' },
        { status: 401 }
      );
    }

    const promptId = params.id;
    const userId = session.user.id;

    // Rate limiting check
    const rateLimitService = createRateLimitService();
    const rateLimitResult = await rateLimitService.checkLimit(userId);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please wait before running another prompt.',
          rateLimitInfo: {
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            reset: rateLimitResult.reset
          }
        },
        { status: 429 }
      );
    }

    // Get the prompt
    const prompt = await prisma.prompt.findUnique({
      where: { id: promptId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        category: true,
      }
    });

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    if (!prompt.published) {
      return NextResponse.json(
        { error: 'Prompt is not published' },
        { status: 403 }
      );
    }

    // Get any additional input from the request body
    const body = await request.json().catch(() => ({}));
    const userInput = body.input || '';

    // Prepare the final prompt text
    let finalPromptText = prompt.content;
    
    // Simple variable substitution if user provided input
    if (userInput) {
      finalPromptText = finalPromptText.replace(/\{\{input\}\}/g, userInput);
      finalPromptText = finalPromptText.replace(/\{\{user_input\}\}/g, userInput);
    }

    // Execute the prompt using AI service
    const aiService = createAIService();
    
    // Check if the model is supported
    const availableModels = aiService.getAvailableModels();
    if (!availableModels.includes(prompt.model)) {
      return NextResponse.json(
        { 
          error: `Model "${prompt.model}" is not available. Available models: ${availableModels.join(', ')}`,
          availableModels 
        },
        { status: 400 }
      );
    }

    try {
      const aiResponse = await aiService.executePrompt(prompt.model, finalPromptText);

      // Log the execution (optional - for analytics)
      // You could create a PromptExecution model to track usage
      
      return NextResponse.json({
        success: true,
        prompt: {
          id: prompt.id,
          title: prompt.title,
          model: prompt.model,
        },
        input: userInput,
        output: aiResponse.content,
        model: aiResponse.model,
        usage: aiResponse.usage,
        rateLimitInfo: {
          remaining: rateLimitResult.remaining,
          reset: rateLimitResult.reset
        }
      });

    } catch (aiError) {
      console.error('AI execution error:', aiError);
      
      // Handle specific AI errors
      if (aiError instanceof Error) {
        if (aiError.message.includes('API key')) {
          return NextResponse.json(
            { error: 'AI service configuration error. Please try again later.' },
            { status: 503 }
          );
        }
        
        if (aiError.message.includes('rate limit')) {
          return NextResponse.json(
            { error: 'AI service rate limit exceeded. Please try again in a few minutes.' },
            { status: 429 }
          );
        }
      }
      
      return NextResponse.json(
        { error: 'Failed to execute prompt with AI service' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error executing prompt:', error);
    return NextResponse.json(
      { error: 'Failed to execute prompt' },
      { status: 500 }
    );
  }
}

// GET: Get prompt details for execution preview
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const promptId = params.id;

    const prompt = await prisma.prompt.findUnique({
      where: { id: promptId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        category: true,
      }
    });

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    if (!prompt.published) {
      return NextResponse.json(
        { error: 'Prompt is not published' },
        { status: 403 }
      );
    }

    // Check if AI service supports this model
    const aiService = createAIService();
    const availableModels = aiService.getAvailableModels();
    const isModelSupported = availableModels.includes(prompt.model);

    return NextResponse.json({
      ...prompt,
      isModelSupported,
      availableModels: isModelSupported ? undefined : availableModels,
      // Check if prompt has input placeholders
      hasInputPlaceholders: prompt.content.includes('{{input}}') || prompt.content.includes('{{user_input}}')
    });

  } catch (error) {
    console.error('Error getting prompt for execution:', error);
    return NextResponse.json(
      { error: 'Failed to get prompt details' },
      { status: 500 }
    );
  }
}