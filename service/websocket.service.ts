import { Comment } from "@prisma/client";
import { RequestScopeService } from ".";
import { prisma } from "../utils.server";

export class WebSocketService extends RequestScopeService {
  
  async addComment(comment: Comment, projectId: string) {
    // Only broadcast non-moderator comments to prevent infinite loops
    // and only if WebSockets are enabled
    if (comment.moderatorId || process.env.PLATFORM_SUPPORTS_WEBSOCKETS !== 'true') {
      return;
    }

    try {
      // Check if Socket.IO is available (global.io is set in server.js)
      if (typeof global !== 'undefined' && global.io) {
        const io = global.io;
        
        // Fetch page information for the comment
        const page = await prisma.page.findUnique({
          where: { id: comment.pageId },
          select: { slug: true, url: true }
        });
        
        // Create enriched comment data for UI
        const enrichedComment = {
          ...comment,
          page: page || { slug: 'Unknown', url: '#' },
          parsedCreatedAt: new Date(comment.createdAt).toLocaleString(),
          // Add other fields that the UI expects
          replies: { commentCount: 0, data: [] },
          parsedContent: comment.content,
          isEmailVerified: false // Default for new comments
        };
        
        // Broadcast new comment to all clients in the project room
        io.to(`project-${projectId}`).emit('new-comment', {
          comment: enrichedComment,
          projectId,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[WebSocketService] Broadcasted new comment ${comment.id} to project-${projectId}`);
      } else {
        console.warn('[WebSocketService] Socket.IO not available - comment not broadcasted');
      }
    } catch (error) {
      console.error('[WebSocketService] Failed to broadcast comment:', error);
    }
  }
}