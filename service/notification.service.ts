import { Comment } from '@prisma/client'
import { RequestScopeService } from '.'
import { makeNewCommentEmailTemplate, makeReplyNotificationEmailTemplate } from '../templates/new_comment'
import { prisma, resolvedConfig } from '../utils.server'
import { markdown } from './comment.service'
import { EmailService } from './email.service'
import { TokenService } from './token.service'
import { UserService } from './user.service'

export class NotificationService extends RequestScopeService {
  userService = new UserService(this.req)
  tokenService = new TokenService()
  emailService = new EmailService()

  // notify when new comment added
  async addComment(comment: Comment, projectId: string) {
    // don't notify if comment is created by moderator
    if (comment.moderatorId) {
      return
    }

    // check if user enable notify
    const project = await prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        enableNotification: true,
        owner: {
          select: {
            id: true,
            email: true,
            enableNewCommentNotification: true,
            notificationEmail: true,
          },
        },
      },
    })

    // don't notify if disable in project settings
    if (!project.enableNotification) {
      return
    }

    const fullComment = await prisma.comment.findUnique({
      where: {
        id: comment.id,
      },
      select: {
        page: {
          select: {
            title: true,
            slug: true,
            project: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    })

    const notificationEmail =
      project.owner.notificationEmail || project.owner.email

    if (project.owner.enableNewCommentNotification) {
      let unsubscribeToken = this.tokenService.genUnsubscribeNewCommentToken(
        project.owner.id,
      )

      const approveToken = await this.tokenService.genApproveToken(comment.id)

      const msg = {
        to: notificationEmail, // Change to your recipient
        from: this.emailService.sender,
        subject: `New comment on "${fullComment.page.project.title}"`,
        html: await this.buildAdminNotificationTemplate(comment, fullComment, approveToken, unsubscribeToken),
      }

      await this.emailService.send(msg)
    }
  }

  async sendReplyNotifications(commentId: string, parentId?: string) {
    try {
      if (!parentId) {
        return
      }

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: {
          by_email: true,
          by_nickname: true,
          content: true,
          approved: true,
          page: {
            select: {
              slug: true,
              title: true,
              url: true,
            },
          },
        },
      })

      if (!comment?.approved) {
        return
      }

      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: {
          by_email: true,
          notifyConfirmedAt: true,
        },
      })

      if (parent?.by_email && parent.notifyConfirmedAt) {
        if (!comment.by_email || parent.by_email !== comment.by_email) {
          const unsubToken = this.tokenService.genAcceptNotifyToken(parentId)
          const unsubscribeLink = `${resolvedConfig.host}/api/open/confirm_reply_notification?token=${encodeURIComponent(unsubToken)}&unsubscribe=1`
          const viewLink = comment.page.url || `${resolvedConfig.host}`
          
          await this.emailService.send({
            to: parent.by_email,
            subject: `New reply on "${comment.page.title || comment.page.slug}"`,
            html: makeReplyNotificationEmailTemplate({
              page_slug: comment.page.title || comment.page.slug,
              content: comment.content,
              by_nickname: comment.by_nickname,
              view_link: viewLink,
              unsubscribe_link: unsubscribeLink,
            }),
          })
        }
      }
    } catch (e) {
      console.warn('[notification.service] reply notification failed', e)
    }
  }

  private async buildAdminNotificationTemplate(comment: any, fullComment: any, approveToken: string, unsubscribeToken: string) {
    // Check if user has verified email
    let emailVerified = false
    let isFirstComment = true
    
    if (comment.by_email) {
      const user = await prisma.user.findUnique({
        where: { email: comment.by_email },
        select: { emailVerified: true },
      })
      emailVerified = Boolean(user?.emailVerified)

      // Check if they have any prior approved comments
      const priorApproved = await prisma.comment.findFirst({
        where: {
          page: { projectId: fullComment.page.project.id || fullComment.page.projectId },
          by_email: comment.by_email,
          approved: true,
          id: { not: comment.id }, // Exclude current comment
        },
        select: { id: true },
      })
      isFirstComment = !priorApproved
    }

    return makeNewCommentEmailTemplate({
      page_slug: fullComment.page.title || fullComment.page.slug,
      by_nickname: comment.by_nickname,
      by_email: comment.by_email,
      approve_link: `${resolvedConfig.host}/open/approve?token=${approveToken}`,
      unsubscribe_link: `${resolvedConfig.host}/api/open/unsubscribe?token=${unsubscribeToken}`,
      content: markdown.render(comment.content),
      notification_preferences_link: `${resolvedConfig.host}/user`,
      email_verified: emailVerified,
      auto_approved: comment.approved,
      is_first_comment: isFirstComment,
    })
  }
}
