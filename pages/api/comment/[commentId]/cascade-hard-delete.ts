import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../../service/comment.service'
import { withUserAuth } from '../../../../utils/auth-wrappers'

export default withUserAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session }
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const commentService = new CommentService(req)

  // Accept either single ID from URL or array from body
  const singleId = req.query.commentId as string
  const { commentIds } = req.body as { commentIds?: string[] }
  
  const idsToDelete = commentIds || [singleId]

  if (!Array.isArray(idsToDelete) || idsToDelete.length === 0) {
    return res.status(400).json({ message: 'No comment IDs provided' })
  }

  try {
    // Hard delete all comments with cascade in single operation
    const result = await commentService.cascadeHardDelete(idsToDelete)

    res.json({
      message: `${idsToDelete.length} comment${idsToDelete.length > 1 ? 's' : ''} permanently deleted`,
      deletedCount: result.deletedCount,
      requested: idsToDelete.length
    })
  } catch (error) {
    console.error('Cascade hard delete error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})