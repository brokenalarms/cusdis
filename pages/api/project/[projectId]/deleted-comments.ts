import { NextApiRequest, NextApiResponse } from 'next'
import { CommentService } from '../../../../service/comment.service'
import { withProjectAuth } from '../../../../utils/auth-wrappers'

export default withProjectAuth(async function handler(req: NextApiRequest, res: NextApiResponse, { session: _session, project, mainLayoutData: _mainLayoutData }) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const commentService = new CommentService(req)

  try {
    const page = parseInt(req.query.page as string) || 1
    const comments = await commentService.getComments(
      project.id,
      req.headers['x-timezone-offset'] ? parseInt(req.headers['x-timezone-offset'] as string) : 0,
      {
        page,
        pageSize: 10,
        includeDeletedParents: true,
        parentId: null, // Only root deleted comments
      }
    )
    
    // Filter to only show actually deleted comments
    const deletedComments = {
      ...comments,
      data: comments.data.filter(comment => comment.deletedAt)
    }

    res.json({ data: deletedComments })
  } catch (error) {
    console.error('Error fetching deleted comments:', error)
    res.status(500).json({ error: 'Failed to fetch deleted comments' })
  }
})