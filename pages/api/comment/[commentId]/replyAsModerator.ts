import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../../service/comment.service'
import { withProjectAuth } from '../../../../utils/auth-wrappers'

export default withProjectAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session, project }
) {
  const commentService = new CommentService(req)
  
  const body = req.body as {
    content: string
  }
  const commentId = req.query.commentId as string

  const created = await commentService.addCommentAsModerator(
    commentId,
    body.content,
  )
  
  res.json({
    data: created,
  })
}, ['POST'], { commentId: true })