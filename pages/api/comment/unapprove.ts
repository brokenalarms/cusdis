import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../service/comment.service'
import { withUserAuth } from '../../../utils/auth-wrappers'

export default withUserAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session }
) {

  const commentService = new CommentService(req)
  const { commentIds } = req.body as { commentIds: string[] }

  if (!Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({ message: 'commentIds array is required' })
  }

  try {
    await commentService.unapprove(commentIds)

    res.json({
      message: 'success',
      unapproved: commentIds.length
    })
  } catch (error) {
    console.error('Unapprove error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}, ['POST'])