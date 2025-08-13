import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../../service/comment.service'
import { statService } from '../../../../service/stat.service'
import { withProjectAuth } from '../../../../utils/auth-wrappers'

export default withProjectAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session: _, project },
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const commentService = new CommentService(req)
  const { page } = req.query as { page: string }
  const timezoneOffsetInHour = req.headers['x-timezone-offset'] || 0

  const queryCommentStat = statService.start(
    'query_comments',
    'Query Comments',
    {
      tags: {
        project_id: project.id,
        from: 'dashboard',
      },
    },
  )

  const comments = await commentService.getComments(
    project.id,
    Number(timezoneOffsetInHour),
    {
      page: Number(page),
      onlyOwn: true,
      select: {
        by_nickname: true,
        by_email: true,
        approved: true,
        moderatorId: true,
      },
    },
  )

  queryCommentStat.end()

  res.json({
    data: comments,
  })
})
