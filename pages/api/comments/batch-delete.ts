import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../service/comment.service'
import { AuthService } from '../../../service/auth.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const commentService = new CommentService(req)

  const { commentIds } = req.body as { commentIds: string[] }
  await commentService.batchDelete(commentIds)

  res.json({
    success: true,
    requested: commentIds.length,
  })
}
