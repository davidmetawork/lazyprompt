import { NextResponse } from 'next/server';
import { prisma } from '@lazyprompt/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST: Vote on a prompt (upvote/downvote)
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const promptId = params.id;
    const userId = session.user.id;
    const { value } = await request.json(); // 1 for upvote, -1 for downvote, 0 to remove vote

    // Check if the prompt exists
    const prompt = await prisma.prompt.findUnique({
      where: { id: promptId }
    });

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    // Check if user has already voted
    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_promptId: {
          userId,
          promptId
        }
      }
    });

    let newUpvoteCount = prompt.upvoteCount;

    if (value === 0 || (existingVote && existingVote.value === value)) {
      // Remove vote if value is 0 or user is clicking same vote
      if (existingVote) {
        await prisma.vote.delete({
          where: { id: existingVote.id }
        });
        newUpvoteCount = Math.max(0, prompt.upvoteCount - existingVote.value);
      }
    } else {
      if (existingVote) {
        // Update existing vote
        await prisma.vote.update({
          where: { id: existingVote.id },
          data: { value }
        });
        // Adjust count: remove old vote, add new vote
        newUpvoteCount = prompt.upvoteCount - existingVote.value + value;
      } else {
        // Create new vote
        await prisma.vote.create({
          data: {
            userId,
            promptId,
            value
          }
        });
        newUpvoteCount = prompt.upvoteCount + value;
      }
    }

    // Update the prompt's vote count
    const updatedPrompt = await prisma.prompt.update({
      where: { id: promptId },
      data: { upvoteCount: Math.max(0, newUpvoteCount) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        category: true,
        _count: {
          select: {
            votes: true
          }
        }
      }
    });

    // Check current user's vote status
    const userVote = await prisma.vote.findUnique({
      where: {
        userId_promptId: {
          userId,
          promptId
        }
      }
    });

    return NextResponse.json({
      ...updatedPrompt,
      isVoted: !!userVote,
      userVoteValue: userVote?.value || 0
    });
  } catch (error) {
    console.error('Error voting on prompt:', error);
    return NextResponse.json(
      { error: 'Failed to vote on prompt' },
      { status: 500 }
    );
  }
}

// GET: Get vote status for a prompt
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const promptId = params.id;

    if (!session || !session.user) {
      return NextResponse.json({
        isVoted: false,
        userVoteValue: 0
      });
    }

    const userVote = await prisma.vote.findUnique({
      where: {
        userId_promptId: {
          userId: session.user.id,
          promptId
        }
      }
    });

    return NextResponse.json({
      isVoted: !!userVote,
      userVoteValue: userVote?.value || 0
    });
  } catch (error) {
    console.error('Error getting vote status:', error);
    return NextResponse.json(
      { error: 'Failed to get vote status' },
      { status: 500 }
    );
  }
}