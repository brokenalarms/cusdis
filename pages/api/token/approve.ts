import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../service/comment.service'
import {
  SecretKey,
  TokenBody,
} from '../../../service/token.service'
import { UsageService } from '../../../service/usage.service'
import { SubscriptionService } from '../../../service/subscription.service'
import { UsageLabel } from '../../../config.common'
import { withTokenAuth } from '../../../utils/auth-wrappers'

export default withTokenAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { tokenPayload }
) {
  const commentService = new CommentService(req)
  const usageService = new UsageService(req)
  const subscriptionService = new SubscriptionService()

  if (req.method === 'GET') {
    const result = tokenPayload as TokenBody.ApproveComment
    await commentService.approve([result.commentId])
    res.send('Approved!')
    
  } else if (req.method === 'POST') {
    const { replyContent } = req.body as { replyContent?: string }
    const tokenBody = tokenPayload as TokenBody.ApproveComment

    if (!replyContent) {
      const result = tokenBody
      await commentService.approve([result.commentId])
      await usageService.incr(UsageLabel.ApproveComment)
      res.json({ message: 'Approved!' })
    } else {
      // Approve comment first
      await commentService.approve([tokenBody.commentId])

      // Then append reply
      const created = await commentService.addCommentAsModerator(
        tokenBody.commentId,
        {
          content: replyContent,
          by_nickname: tokenBody.owner.displayName,
        }
      )
      await usageService.incr(UsageLabel.ApproveComment)

      res.json({
        message: 'Approved and replied!',
        reply: created,
      })
    }
  }
}, {
  secretKey: SecretKey.ApproveComment,
  allowedMethods: ['GET', 'POST']
})