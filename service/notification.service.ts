import { Comment } from '@prisma/client'
import { RequestScopeService } from '.'
import {
  makeNewCommentEmailTemplate,
  makeReplyNotificationEmailTemplate,
} from '../templates/new_comment'
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
      console.log(
        '[NotificationService] Skip admin notification - moderator comment',
        { commentId: comment.id },
      )
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

    if (!project) {
      console.log(
        '[NotificationService] Skip admin notification - project not found',
        { projectId },
      )
      return
    }

    // don't notify if disable in project settings
    if (!project.enableNotification) {
      console.log(
        '[NotificationService] Skip admin notification - project notifications disabled',
        { projectId },
      )
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
      console.log('[NotificationService] Sending admin notification', {
        commentId: comment.id,
        to: notificationEmail,
        approved: comment.approved,
      })

      let unsubscribeToken = this.tokenService.genUnsubscribeNewCommentToken(
        project.owner.id,
      )

      const approveToken = await this.tokenService.genApproveToken(comment.id)

      const msg = {
        to: notificationEmail, // Change to your recipient
        from: this.emailService.sender,
        subject: `New comment on "${fullComment.page.project.title}"`,
        html: await this.buildAdminNotificationTemplate(
          comment,
          fullComment,
          approveToken,
          unsubscribeToken,
        ),
      }

      await this.emailService.send(msg)
    } else {
      console.log(
        '[NotificationService] Skip admin notification - user preference disabled',
        {
          projectId,
          enableNewCommentNotification:
            project.owner.enableNewCommentNotification,
        },
      )
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

      // Get all ancestors in the thread to notify everyone in the conversation
      const ancestorIds = await this.getAncestorCommentIds(parentId)
      const notifiedEmails = new Set<string>() // Prevent duplicate emails to same person

      for (const ancestorId of ancestorIds) {
        const ancestor = await prisma.comment.findUnique({
          where: { id: ancestorId },
          select: {
            by_email: true,
            notifyConfirmedAt: true,
          },
        })

        if (ancestor?.by_email && ancestor.notifyConfirmedAt) {
          // Skip if already notified this email or if replying to self
          if (
            notifiedEmails.has(ancestor.by_email) ||
            (comment.by_email && ancestor.by_email === comment.by_email)
          ) {
            continue
          }

          const unsubToken = this.tokenService.genAcceptNotifyToken(ancestorId)
          const unsubscribeLink = `${
            resolvedConfig.host
          }/api/open/confirm_reply_notification?token=${encodeURIComponent(
            unsubToken,
          )}&unsubscribe=1`
          const viewLink = comment.page.url || `${resolvedConfig.host}`

          await this.emailService.send({
            to: ancestor.by_email,
            subject: `New reply on "${
              comment.page.title || comment.page.slug
            }"`,
            html: makeReplyNotificationEmailTemplate({
              page_slug: comment.page.title || comment.page.slug,
              content: comment.content,
              by_nickname: comment.by_nickname,
              view_link: viewLink,
              unsubscribe_link: unsubscribeLink,
            }),
          })

          notifiedEmails.add(ancestor.by_email)
        }
      }
    } catch (e) {
      console.warn('[notification.service] reply notification failed', e)
    }
  }

  private async getAncestorCommentIds(commentId: string): Promise<string[]> {
    const ancestors: string[] = []
    let currentId: string | null = commentId

    // Walk up the parent chain (with safety limit to prevent infinite loops)
    let depth = 0
    const maxDepth = 10 // Reasonable limit for comment thread depth

    while (currentId && depth < maxDepth) {
      ancestors.push(currentId)

      const comment = await prisma.comment.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      })

      currentId = comment?.parentId || null
      depth++
    }

    return ancestors
  }

  private async buildAdminNotificationTemplate(
    comment: any,
    fullComment: any,
    approveToken: string,
    unsubscribeToken: string,
  ) {
    // Check if commenter has verified their email
    let commenterEmailVerified = false
    let isFirstComment = true

    if (comment.by_email) {
      const commenter = await prisma.commenter.findUnique({
        where: { email: comment.by_email },
        select: { verifiedAt: true },
      })
      commenterEmailVerified = Boolean(commenter?.verifiedAt)

      // Check if the commenter has any prior approved comments
      const priorApproved = await prisma.comment.findFirst({
        where: {
          page: {
            projectId:
              fullComment.page.project.id || fullComment.page.projectId,
          },
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
      email_verified: commenterEmailVerified,
      auto_approved: comment.approved,
      is_first_comment: isFirstComment,
    })
  }
}
