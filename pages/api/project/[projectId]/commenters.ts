import { NextApiRequest, NextApiResponse } from 'next'
import { statService } from '../../../../service/stat.service'
import { prisma } from '../../../../utils.server'
import { withProjectAuth } from '../../../../utils/auth-wrappers'

export default withProjectAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session, project }
) {

  const { page } = req.query as { page: string }

  const pageSize = 10
  const currentPage = Number(page) || 1
  const offset = (currentPage - 1) * pageSize

  // Use Prisma queries instead of raw SQL to avoid table name issues
  // First get all comments for this project to group by email
  const allComments = await prisma.comment.findMany({
    where: {
      page: {
        projectId: project.id,
      },
      deletedAt: null,
      OR: [
        { by_email: { not: null } },      // Regular commenters
        { moderatorId: { not: null } }    // Admin commenters  
      ],
    },
    select: {
      by_email: true,
      by_nickname: true,
      id: true,
      createdAt: true,
      content: true,
      moderatorId: true,
      page: {
        select: {
          slug: true,
          url: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })



  // Group comments by email and count them
  const commenterMap = new Map<
    string,
    {
      email: string
      nickname: string
      commentCount: number
      comments: any[]
      isAdmin: boolean
    }
  >()

  allComments.forEach((comment) => {
    // Group by moderatorId for admin comments, by_email for regular comments
    const groupKey = comment.moderatorId || comment.by_email
    const displayEmail = comment.moderatorId 
      ? `admin-${comment.moderatorId}`
      : comment.by_email
    
    if (!groupKey) return // Skip if no identifier available
    
    if (!commenterMap.has(groupKey)) {
      commenterMap.set(groupKey, {
        email: displayEmail,
        nickname: comment.by_nickname || '',
        commentCount: 0,
        comments: [],
        isAdmin: !!comment.moderatorId,
      })
    }
    const commenter = commenterMap.get(groupKey)!
    commenter.commentCount++

    // Mark as admin if any comment has moderatorId
    if (comment.moderatorId) {
      commenter.isAdmin = true
    }
    if (commenter.comments.length < 3) {
      commenter.comments.push({
        ...comment,
        parsedCreatedAt: new Date(comment.createdAt).toLocaleString(),
      })
    }
  })


  // Convert to array and sort by comment count
  const allCommenters = Array.from(commenterMap.values()).sort(
    (a, b) => b.commentCount - a.commentCount,
  )

  // Apply pagination
  const total = allCommenters.length
  const pageCount = Math.ceil(total / pageSize)
  const commentersWithComments = allCommenters.slice(offset, offset + pageSize)

  res.json({
    data: {
      data: commentersWithComments,
      total,
      page: currentPage,
      pageCount,
    },
  })
}, ['GET'])
