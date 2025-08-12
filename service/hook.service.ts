import { Comment } from "@prisma/client";
import { RequestScopeService } from ".";
import { NotificationService } from "./notification.service";
import { WebhookService } from "./webhook.service";

export class HookService extends RequestScopeService {

  notificationService = new NotificationService(this.req)
  webhookService = new WebhookService(this.req)

  async addComment(comment: Comment, projectId: string) {
    console.log('[HookService] Processing new comment', { commentId: comment.id, projectId })
    try {
      await this.notificationService.addComment(comment, projectId)
    } catch (e) {
      console.error('[HookService] Admin notification failed', e)
    }
    await this.webhookService.addComment(comment, projectId)
  }

  async approveComment(commentId: string, parentId?: string) {
    await this.notificationService.sendReplyNotifications(commentId, parentId)
  }
}
