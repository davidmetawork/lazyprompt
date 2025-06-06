import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lazyprompt/database';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// GET: Get user profile with stats
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    
    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Count user's created prompts
    const createdPrompts = await prisma.prompt.count({
      where: { 
        userId,
        published: true 
      },
    });
    
    // Count user's purchased prompts
    const purchasedPrompts = await prisma.purchase.count({
      where: { userId },
    });

    // Count total upvotes received
    const totalUpvotes = await prisma.vote.count({
      where: {
        prompt: { userId },
        value: 1
      }
    });
    
    const profile = {
      ...user,
      stats: {
        createdPrompts,
        purchasedPrompts,
        totalUpvotes
      }
    };
    
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

// PATCH: Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    const json = await request.json();
    
    // Only allow updating certain fields
    const { name } = json;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string' },
        { status: 400 }
      );
    }
    
    // Update user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });
    
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
} 