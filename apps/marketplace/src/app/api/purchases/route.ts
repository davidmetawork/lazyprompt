import { NextRequest } from 'next/server';
import { prisma } from '@lazyprompt/database';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { successResponse, errorResponse } from '@/lib/api-response';

// GET: Fetch all purchases for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return errorResponse('Unauthorized', 401);
    }
    
    const userId = session.user.id;
    
    const purchases = await prisma.purchase.findMany({
      where: { userId },
      include: {
        prompt: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return successResponse(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return errorResponse('Failed to fetch purchases');
  }
}

// POST: Create a new purchase
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return errorResponse('Unauthorized', 401);
    }
    
    const userId = session.user.id;
    const json = await request.json();
    
    // Validate required fields
    const { promptId } = json;
    
    if (!promptId) {
      return errorResponse('Prompt ID is required', 400);
    }
    
    // Get the prompt to check if it exists and get its price
    const prompt = await prisma.prompt.findUnique({
      where: { id: promptId },
      select: { id: true, price: true, userId: true },
    });
    
    if (!prompt) {
      return errorResponse('Prompt not found', 404);
    }
    
    // Check if user is not buying their own prompt
    if (prompt.userId === userId) {
      return errorResponse('You cannot purchase your own prompt', 400);
    }
    
    // Check if the user has already purchased this prompt
    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        userId,
        promptId,
      },
    });
    
    if (existingPurchase) {
      return errorResponse('You have already purchased this prompt', 409);
    }
    
    // In a real app, you would handle payment processing here
    // This is just a placeholder for demo purposes
    
    // Create the purchase
    const purchase = await prisma.purchase.create({
      data: {
        userId,
        promptId,
        price: prompt.price,
      },
      include: {
        prompt: {
          include: {
            category: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });
    
    return successResponse(purchase, 201);
  } catch (error) {
    console.error('Error creating purchase:', error);
    return errorResponse('Failed to create purchase');
  }
} 