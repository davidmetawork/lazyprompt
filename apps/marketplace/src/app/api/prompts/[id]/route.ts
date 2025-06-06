import { NextResponse } from 'next/server';
import { prisma } from '@lazyprompt/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch a specific prompt by ID
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    const prompt = await prisma.prompt.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        category: true,
      },
    });
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(prompt);
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt' },
      { status: 500 }
    );
  }
}

// PATCH: Update a specific prompt
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const id = params.id;
    const json = await request.json();
    
    // Fetch the prompt to check ownership
    const existingPrompt = await prisma.prompt.findUnique({
      where: { id },
      select: { userId: true },
    });
    
    if (!existingPrompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }
    
    // Check if the user is the owner of the prompt
    if (existingPrompt.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not own this prompt' },
        { status: 403 }
      );
    }
    
    // Update the prompt
    const updatedPrompt = await prisma.prompt.update({
      where: { id },
      data: {
        title: json.title,
        description: json.description,
        content: json.content,
        price: json.price ? parseFloat(json.price) : undefined,
        categoryId: json.categoryId,
        published: json.published,
      },
    });
    
    return NextResponse.json(updatedPrompt);
  } catch (error) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a specific prompt
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const id = params.id;
    
    // Fetch the prompt to check ownership
    const existingPrompt = await prisma.prompt.findUnique({
      where: { id },
      select: { userId: true },
    });
    
    if (!existingPrompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }
    
    // Check if the user is the owner of the prompt
    if (existingPrompt.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not own this prompt' },
        { status: 403 }
      );
    }
    
    // Delete the prompt
    await prisma.prompt.delete({
      where: { id },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    );
  }
} 