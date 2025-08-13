import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../utils.server'
import { withProjectAuth } from '../../../../../utils/auth-wrappers'

export default withProjectAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session: _session, project, mainLayoutData: _mainLayoutData }
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { emails } = req.body as { emails: string[] }

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ message: 'emails must be a non-empty array' })
  }

  try {
    // Batch delete all comments from the specified email addresses
    const result = await prisma.comment.updateMany({
      where: {
        by_email: {
          in: emails,
        },
        page: {
          projectId: project.id,
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
})