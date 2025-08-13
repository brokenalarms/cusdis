import { Project } from '@prisma/client'
import { NextApiRequest, NextApiResponse } from 'next'
import { AuthService } from '../../../../../service/auth.service'
import { ProjectService } from '../../../../../service/project.service'
import { prisma } from '../../../../../utils.server'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const projectService = new ProjectService(req)
  const authService = new AuthService(req, res)
  
  const { projectId } = req.query as { projectId: string }
  const { emails } = req.body as { emails: string[] }

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ message: 'emails must be a non-empty array' })
  }

  // only owner can delete comments
  const project = (await projectService.get(projectId, {
    select: {
      ownerId: true,
    },
  })) as Pick<Project, 'ownerId'>

  if (!(await authService.projectOwnerGuard(project))) {
    return
  }

  try {
    // Batch delete all comments from the specified email addresses
    const result = await prisma.comment.updateMany({
      where: {
        by_email: {
          in: emails,
        },
        page: {
          projectId,
        },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    })

    res.json({
      success: true,
      deleted: result.count,
      emails: emails.length,
    })
  } catch (error) {
    console.error('Batch delete by email error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}