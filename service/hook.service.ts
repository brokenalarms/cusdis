import { Comment } from "@prisma/client";
import { RequestScopeService } from ".";
import { NotificationService } from "./notification.service";
import { WebhookService } from "./webhook.service";
import { WebSocketService } from "./websocket.service";
import { prisma } from "../utils.server";

export class HookService extends RequestScopeService {

  notificationService = new NotificationService(this.req)
  webhookService = new WebhookService(this.req)
  websocketService = new WebSocketService(this.req)

  async addComment(comment: Comment, projectId: string) {
    try {
      await this.notificationService.addComment(comment, projectId)
    } catch (e) {
      console.error('[HookService] Admin notification failed', e)
    }
    await this.webhookService.addComment(comment, projectId)
    await this.websocketService.addComment(comment, projectId)
  }

  async approveComment(commentId: string, parentId?: string) {
    await this.notificationService.sendReplyNotifications(commentId, parentId)
  }
}
