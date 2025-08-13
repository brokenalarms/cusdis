import { NextApiRequest, NextApiResponse } from "next";
import { CommentService } from "../../../service/comment.service";
import { AuthService } from "../../../service/auth.service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const authService = new AuthService(req, res);
  const commentService = new CommentService(req);
  
  const { commentIds } = req.body as { commentIds: string[] };
  
  if (!Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({ message: 'commentIds must be a non-empty array' });
  }

  try {
    const session = await authService.getSession();
    if (!session) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const deletedCount = await commentService.batchDelete(commentIds);
    
    res.json({
      success: true,
      deleted: deletedCount,
      requested: commentIds.length
    });
  } catch (error) {
    console.error('Batch delete error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}