import { NextApiRequest, NextApiResponse } from 'next'
import { getSession } from '../../../../utils.server'
import { CommentService } from '../../../../service/comment.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req)
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { projectId } = req.query
  const commentService = new CommentService(req)

  if (req.method === 'GET') {
    try {
      const page = parseInt(req.query.page as string) || 1
      const comments = await commentService.getComments(
        projectId as string,
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
  } else {
    res.setHeader('Allow', ['GET'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}