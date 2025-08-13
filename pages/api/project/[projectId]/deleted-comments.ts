import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../../service/comment.service'
import { withProjectAuth } from '../../../../utils/auth-wrappers'

export default withProjectAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { session: _session, project },
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const commentService = new CommentService(req)

  try {
    const page = parseInt(req.query.page as string) || 1
    const timezoneOffset = req.headers['x-timezone-offset']
      ? parseInt(req.headers['x-timezone-offset'] as string)
      : 0

    // Use the new getDeletedComments method
    const deletedComments = await commentService.getDeletedComments(
      project.id,
      timezoneOffset,
      {
        page,
        pageSize: 10,
        parentId: null, // Only root deleted comments
      },
    )

    res.json({ data: deletedComments })
  } catch (error) {
    console.error('Error fetching deleted comments:', error)
    res.status(500).json({ error: 'Failed to fetch deleted comments' })
  }
})