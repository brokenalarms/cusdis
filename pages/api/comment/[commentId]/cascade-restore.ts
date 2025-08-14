import { NextApiRequest, NextApiResponse } from 'next'
import { withUserAuth } from '../../../../utils/auth-wrappers'
import { prisma } from '../../../../utils.server'

export default withUserAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session }
) {

  // Accept either single ID from URL or array from body
  const singleId = req.query.commentId as string
  const { commentIds } = req.body as { commentIds?: string[] }
  
  const idsToRestore = commentIds || [singleId]

  if (!Array.isArray(idsToRestore) || idsToRestore.length === 0) {
    return res.status(400).json({ message: 'No comment IDs provided' })
  }

  try {
    // Restore all comments (set deletedAt to null)
    const result = await prisma.comment.updateMany({
      where: {
        id: { in: idsToRestore }
      },
      data: {
        deletedAt: null
      }
    })

    res.json({
      message: `${idsToRestore.length} comment${idsToRestore.length > 1 ? 's' : ''} restored`,
      restored: result.count,
      requested: idsToRestore.length
    })
  } catch (error) {
    console.error('Cascade restore error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}, ['POST'])