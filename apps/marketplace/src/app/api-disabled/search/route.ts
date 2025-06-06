import { NextResponse } from 'next/server';
import { prisma } from '@lazyprompt/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Search prompts, users, and categories
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all'; // all, prompts, users, categories
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        prompts: [],
        users: [],
        categories: [],
        total: 0
      });
    }

    const searchQuery = query.trim();
    const results: any = {
      prompts: [],
      users: [],
      categories: [],
      total: 0
    };

    // Search prompts
    if (type === 'all' || type === 'prompts') {
      const prompts = await prisma.prompt.findMany({
        where: {
          published: true,
          OR: [
            {
              title: {
                contains: searchQuery,
                mode: 'insensitive',
              }
            },
            {
              description: {
                contains: searchQuery,
                mode: 'insensitive',
              }
            },
            {
              content: {
                contains: searchQuery,
                mode: 'insensitive',
              }
            },
            {
              model: {
                contains: searchQuery,
                mode: 'insensitive',
              }
            }
          ]
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
        orderBy: [
          { upvoteCount: 'desc' },
          { createdAt: 'desc' }
        ],
        take: limit
      });

      // Transform prompts to include vote status
      results.prompts = prompts.map(prompt => ({
        ...prompt,
        isVoted: session?.user ? prompt.votes?.length > 0 : false,
        votes: undefined // Remove votes array from response
      }));
    }

    // Search users (prompt creators)
    if (type === 'all' || type === 'users') {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            {
              name: {
                contains: searchQuery,
                mode: 'insensitive',
              }
            },
            {
              email: {
                contains: searchQuery,
                mode: 'insensitive',
              }
            }
          ]
        },
        select: {
          id: true,
          name: true,
          image: true,
          _count: {
            select: {
              prompts: {
                where: {
                  published: true
                }
              }
            }
          }
        },
        take: Math.min(limit, 10) // Limit user results
      });

      results.users = users;
    }

    // Search categories
    if (type === 'all' || type === 'categories') {
      const categories = await prisma.category.findMany({
        where: {
          name: {
            contains: searchQuery,
            mode: 'insensitive',
          }
        },
        include: {
          _count: {
            select: {
              prompts: {
                where: {
                  published: true
                }
              }
            }
          }
        },
        take: Math.min(limit, 10) // Limit category results
      });

      results.categories = categories;
    }

    // Calculate total results
    results.total = results.prompts.length + results.users.length + results.categories.length;

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}

// POST: Save search query for analytics (optional)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { query, resultCount } = await request.json();

    // Optional: Log search queries for analytics
    // You could create a SearchLog model to track popular searches
    
    // For now, just return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging search:', error);
    return NextResponse.json(
      { error: 'Failed to log search' },
      { status: 500 }
    );
  }
}