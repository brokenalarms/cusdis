import { NextApiRequest, NextApiResponse } from 'next'
import { withUserAuth } from '../../../utils/auth-wrappers'
import { prisma } from '../../../utils.server'

export default withUserAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session }
) {

  const { commentIds } = req.body as { commentIds: string[] }

  if (!Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({ message: 'commentIds array is required' })
  }

  try {
    // Restore all comments (set deletedAt to null)
    const result = await prisma.comment.updateMany({
      where: {
        id: { in: commentIds }
      },
      data: {
        deletedAt: null
      }
    })

    res.json({
      message: `${commentIds.length} comment${commentIds.length > 1 ? 's' : ''} restored`,
      restored: result.count,
      requested: commentIds.length
    })
  } catch (error) {
    console.error('Restore error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}, ['POST'])