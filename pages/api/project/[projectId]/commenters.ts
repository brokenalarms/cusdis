import { Project } from '@prisma/client'
import { NextApiRequest, NextApiResponse } from 'next'
import { AuthService } from '../../../../service/auth.service'
import { ProjectService } from '../../../../service/project.service'
import { statService } from '../../../../service/stat.service'
import { prisma } from '../../../../utils.server'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const projectService = new ProjectService(req)
  const authService = new AuthService(req, res)
  
  if (req.method === 'GET') {
    const { projectId, page } = req.query as {
      projectId: string
      page: string
    }

    // only owner can get commenters
    const project = (await projectService.get(projectId, {
      select: {
        ownerId: true,
      },
    })) as Pick<Project, 'ownerId'>

    if (!(await authService.projectOwnerGuard(project))) {
      return
    }

    const pageSize = 10
    const currentPage = Number(page) || 1
    const offset = (currentPage - 1) * pageSize

    // Use Prisma queries instead of raw SQL to avoid table name issues
    // First get all comments for this project to group by email
    const allComments = await prisma.comment.findMany({
      where: {
        page: {
          projectId,
        },
        deletedAt: null,
        by_email: {
          not: null,
        },
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
    const commenterMap = new Map<string, {
      email: string
      nickname: string
      commentCount: number
      comments: any[]
      isAdmin: boolean
    }>()

    allComments.forEach(comment => {
      const email = comment.by_email!
      if (!commenterMap.has(email)) {
        commenterMap.set(email, {
          email,
          nickname: comment.by_nickname || '',
          commentCount: 0,
          comments: [],
          isAdmin: false,
        })
      }
      const commenter = commenterMap.get(email)!
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
    const allCommenters = Array.from(commenterMap.values()).sort((a, b) => b.commentCount - a.commentCount)
    
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
  }
}