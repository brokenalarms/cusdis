import { NextApiRequest, NextApiResponse } from 'next'
import { UsageLabel } from '../../../config.common'
import { CommentService } from '../../../service/comment.service'
import { UsageService } from '../../../service/usage.service'
import { withUserAuth } from '../../../utils/auth-wrappers'

export default withUserAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session }
) {

  const commentService = new CommentService(req)
  const usageService = new UsageService(req)
  const { commentIds } = req.body as { commentIds: string[] }

  if (!Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({ message: 'commentIds array is required' })
  }

  try {
    await commentService.approve(commentIds)
    
    // Track usage for each approval
    for (const commentId of commentIds) {
      await usageService.incr(UsageLabel.ApproveComment)
    }

    res.json({
      message: 'success',
      approved: commentIds.length
    })
  } catch (error) {
    console.error('Approve error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}, ['POST'])