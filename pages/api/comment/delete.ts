import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../service/comment.service'
import { withUserAuth } from '../../../utils/auth-wrappers'

export default withUserAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session }
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const commentService = new CommentService(req)
  const { commentIds } = req.body as { commentIds: string[] }

  if (!Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({ message: 'commentIds array is required' })
  }

  try {
    const deleted = await commentService.delete(commentIds)

    res.json({
      message: `${commentIds.length} comment${commentIds.length > 1 ? 's' : ''} deleted`,
      deleted,
      requested: commentIds.length
    })
  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})