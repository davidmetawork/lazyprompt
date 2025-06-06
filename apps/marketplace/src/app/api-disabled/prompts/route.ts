import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch all published prompts
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'trending'; // trending, newest, votes
    const model = searchParams.get('model');
    
    // Build filter object based on query parameters
    const filter: any = {
      published: true,
    };
    
    // Add category filter if provided
    if (categoryId) {
      filter.categoryId = categoryId;
    }
    
    // Add model filter if provided
    if (model) {
      filter.model = model;
    }
    
    // Add search filter if provided
    if (search) {
      filter.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          }
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          }
        }
      ];
    }

    // Determine sort order
    let orderBy: any;
    switch (sort) {
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'votes':
        orderBy = { upvoteCount: 'desc' };
        break;
      case 'trending':
      default:
        // For trending, we'll use a combination of votes and recency
        orderBy = [
          { upvoteCount: 'desc' },
          { createdAt: 'desc' }
        ];
        break;
    }
    
    const prompts = await prisma.prompt.findMany({
      where: filter,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        category: true,
        votes: session?.user ? {
          where: {
            userId: session.user.id
          }
        } : false,
        _count: {
          select: {
            votes: true
          }
        }
      },
      orderBy
    });

    // Transform the results to include user's vote status
    const transformedPrompts = prompts.map(prompt => ({
      ...prompt,
      isVoted: session?.user ? prompt.votes?.length > 0 : false,
      votes: undefined // Remove the votes array from response
    }));
    
    return NextResponse.json(transformedPrompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompts' },
      { status: 500 }
    );
  }
}

// POST: Create a new prompt
export async function POST(request: Request) {
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
    
    // Validate required fields
    const { title, description, content, model, price = 0, categoryId } = json;
    
    if (!title || !description || !content || !model || !categoryId) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, content, model, categoryId' },
        { status: 400 }
      );
    }
    
    // Create the prompt
    const prompt = await prisma.prompt.create({
      data: {
        title,
        description,
        content,
        model,
        price: parseFloat(price),
        categoryId,
        userId,
        published: json.published ?? true,
      },
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
    
    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to create prompt' },
      { status: 500 }
    );
  }
} 