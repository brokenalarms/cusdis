import { Comment, Page, Prisma, User } from '@prisma/client'
import { RequestScopeService, UserSession } from '.'
import { prisma, resolvedConfig } from '../utils.server'
import { PageService } from './page.service'
import dayjs from 'dayjs'
import MarkdownIt from 'markdown-it'
import { HookService } from './hook.service'
import { statService } from './stat.service'
import { EmailService } from './email.service'
import { TokenService } from './token.service'
import { makeConfirmReplyNotificationTemplate, makeEmailVerificationTemplate } from '../templates/confirm_reply_notification'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

export const markdown = MarkdownIt({
  linkify: true,
})

markdown.disable(['image', 'link'])

export type CommentWrapper = {
  commentCount: number
  pageSize: number
  pageCount: number
  data: CommentItem[]
}

export type CommentItem = Comment & {
  page: Page
} & {
  replies: CommentWrapper
  parsedContent: string
  parsedCreatedAt: string
}

export class CommentService extends RequestScopeService {
  pageService = new PageService(this.req)
  hookService = new HookService(this.req)
  emailService = new EmailService()
  tokenService = new TokenService()

  private formatComment(comment: Comment & Partial<{ replies: Comment[] }>, timezoneOffset: number = 0): CommentItem {
    const parsedCreatedAt = dayjs
      .utc(comment.createdAt)
      .utcOffset(timezoneOffset)
      .format('YYYY-MM-DD HH:mm')
    
    // Handle deleted comments with placeholder content
    const isDeleted = comment.deletedAt !== null
    const displayContent = isDeleted ? "This comment has been deleted" : comment.content
    const displayNickname = isDeleted ? "deleted" : comment.by_nickname
    
    const parsedContent = markdown.render(displayContent) as string
    
    return {
      ...comment,
      by_nickname: displayNickname,
      content: displayContent,
      parsedContent,
      parsedCreatedAt,
      replies: comment.replies || { data: [], commentCount: 0, pageSize: 0, pageCount: 0 }
    } as CommentItem
  }

  private filterDeletedCommentsWithoutActiveChildren(comments: any[]): any[] {
    // Helper function to check if a comment has any non-deleted descendants
    const hasActiveDescendants = (comment: any): boolean => {
      if (!comment.replies || comment.replies.length === 0) {
        return false
      }
      
      // Check if any direct children are not deleted
      const hasActiveDirectChildren = comment.replies.some((reply: any) => !reply.deletedAt)
      if (hasActiveDirectChildren) {
        return true
      }
      
      // Recursively check deleted children for active descendants
      return comment.replies.some((reply: any) => hasActiveDescendants(reply))
    }
    
    return comments.filter(comment => {
      // Keep non-deleted comments
      if (!comment.deletedAt) {
        return true
      }
      
      // Keep deleted comments only if they have active descendants
      return hasActiveDescendants(comment)
    })
  }

  async getComments(
    projectId: string,
    timezoneOffset: number,
    options?: {
      parentId?: string
      page?: number
      select?: Prisma.CommentSelect
      pageSlug?: string | Prisma.StringFilter
      onlyOwn?: boolean
      approved?: boolean
      pageSize?: number
      includeReplies?: boolean
      includeDeletedParents?: boolean
    },
  ): Promise<CommentWrapper> {
    const pageSize = options?.pageSize || 10

    const include = options?.includeReplies ? {
      page: true,
      replies: {
        where: { deletedAt: null },
        include: {
          page: true,
          replies: true // Prisma will recursively include all nested replies
        }
      }
    } : {
      page: true,
      _count: {
        select: {
          replies: {
            where: { deletedAt: null }
          }
        }
      }
    }

    const baseWhere = {
      approved: options?.approved === true ? true : options?.approved,
      parentId: options?.parentId,
      page: {
        slug: options?.pageSlug,
        projectId,
        project: {
          deletedAt: {
            equals: null,
          },
          ownerId: options?.onlyOwn
            ? (await this.getSession()).uid
            : undefined,
        },
      },
    } as Prisma.CommentWhereInput

    // Build query based on includeDeletedParents option
    const where = options?.includeDeletedParents 
      ? baseWhere  // Include all comments (we'll filter post-fetch)
      : {          // Exclude deleted comments at query level
          ...baseWhere,
          deletedAt: { equals: null }
        }

    const baseQuery = {
      include,
      where,
    }

    const page = options?.page || 1

    const [commentCount, comments] = await prisma.$transaction([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        ...baseQuery,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ])

    const pageCount = Math.ceil(commentCount / pageSize) || 1
    
    // Apply post-processing filtering only when includeDeletedParents is enabled
    const filteredComments = options?.includeDeletedParents 
      ? this.filterDeletedCommentsWithoutActiveChildren(comments)  // Keep deleted parents only if they have active children
      : comments  // No filtering needed, query already excluded deleted comments
    
    // Format comments - Prisma will have included replies if requested
    const formattedComments = filteredComments.map(comment => {
      const formatted = this.formatComment(comment, timezoneOffset)
      
      if (options?.includeReplies && comment.replies) {
        // Recursively format nested replies that Prisma included
        const formatReplies = (replies: any[]): CommentItem[] => {
          return replies.map(reply => {
            const formattedReply = this.formatComment(reply, timezoneOffset)
            if (reply.replies && reply.replies.length > 0) {
              formattedReply.replies = {
                data: formatReplies(reply.replies),
                commentCount: reply.replies.length,
                pageSize: 0,
                pageCount: 0
              }
            } else {
              formattedReply.replies = { data: [], commentCount: 0, pageSize: 0, pageCount: 0 }
            }
            return formattedReply
          })
        }
        
        formatted.replies = {
          data: formatReplies(comment.replies),
          commentCount: comment.replies.length,
          pageSize: 0,
          pageCount: 0
        }
      } else {
        // Use _count from Prisma for reply count without fetching full replies
        const replyCount = (comment as any)._count?.replies || 0
        formatted.replies = { data: [], commentCount: replyCount, pageSize: 0, pageCount: 0 }
      }
      
      return formatted
    })

    return {
      data: formattedComments,
      commentCount,
      pageSize,
      pageCount,
    }
  }

  async getProject(commentId: string) {
    const res = await prisma.comment.findUnique({
      where: {
        id: commentId,
      },
      select: {
        page: {
          select: {
            project: {
              select: {
                id: true,
                ownerId: true,
              },
            },
          },
        },
      },
    })

    return res.page.project
  }

  async addComment(
    projectId: string,
    pageSlug: string,
    body: {
      content: string
      email: string
      nickname: string
      pageUrl?: string
      pageTitle?: string
    },
    parentId?: string,
  ) {
    // touch page
    const page = await this.pageService.upsertPage(pageSlug, projectId, {
      pageTitle: body.pageTitle,
      pageUrl: body.pageUrl,
    })

    const created = await prisma.comment.create({
      data: {
        content: body.content,
        by_email: body.email,
        by_nickname: body.nickname,
        pageId: page.id,
        parentId,
      },
    })

    // Auto-approval logic: if user has verified email AND prior approved comment
    let shouldAutoApprove = false
    try {
      if (body.email) {
        const verifiedUser = await prisma.user.findFirst({
          where: {
            email: body.email,
            emailVerified: { not: null },
          },
          select: { id: true },
        })

        const priorApproved = await prisma.comment.findFirst({
          where: {
            page: { projectId },
            by_email: body.email,
            approved: true,
          },
          select: { id: true },
        })
        
        shouldAutoApprove = Boolean(verifiedUser && priorApproved)
      }
    } catch (e) {
      console.warn('auto-approve check failed', e)
    }

    // Apply auto-approval if conditions met
    let finalComment = created
    if (shouldAutoApprove) {
      finalComment = await prisma.comment.update({
        where: { id: created.id },
        data: { approved: true },
      })
    }

    // Trigger hooks with final state
    await this.hookService.addComment(finalComment, projectId)

    // Return formatted comment that matches CommentItem structure
    return this.formatComment(finalComment, 0)
  }

  async addCommentAsModerator(
    parentId: string,
    content: string,
    options?: {
      owner?: User
    },
  ) {
    const session = options?.owner
      ? {
          user: options.owner,
          uid: options.owner.id,
        }
      : await this.getSession()
    const parent = await prisma.comment.findUnique({
      where: {
        id: parentId,
      },
    })

    const created = await prisma.comment.create({
      data: {
        content: content,
        by_email: session.user.email,
        by_nickname: session.user.name,
        moderatorId: session.uid,
        pageId: parent.pageId,
        approved: true,
        parentId,
      },
    })

    // Trigger reply notifications for moderator replies (since they're pre-approved)
    await this.hookService.notificationService.sendReplyNotifications(created.id, parentId)

    // Return formatted comment that matches CommentItem structure
    return this.formatComment(created, 0)
  }

  async approve(commentIds: string | string[]) {
    const ids = Array.isArray(commentIds) ? commentIds : [commentIds]
    if (ids.length === 0) return

    await prisma.$transaction(async (tx) => {
      // Get all comments with their details
      const comments = await tx.comment.findMany({
        where: { id: { in: ids } },
        select: { id: true, parentId: true, by_email: true }
      })

      // Update all comments to approved
      await tx.comment.updateMany({
        where: { id: { in: ids } },
        data: { approved: true }
      })

      // Handle email verification for all unique emails
      const uniqueEmails = [...new Set(comments.map(c => c.by_email).filter(Boolean))]
      for (const email of uniqueEmails) {
        await tx.user.upsert({
          where: { email },
          update: { emailVerified: new Date() },
          create: { email, emailVerified: new Date() }
        })
      }

      // Trigger hooks for each comment (outside transaction since hooks may have side effects)
      return comments
    }).then(async (comments) => {
      for (const comment of comments) {
        await this.hookService.approveComment(comment.id, comment.parentId)
        statService.capture('comment_approve')
      }
    })
  }

  async delete(commentIds: string | string[]) {
    const ids = Array.isArray(commentIds) ? commentIds : [commentIds]
    if (ids.length === 0) return 0

    const result = await prisma.comment.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    })
    return result.count
  }

  async sendConfirmReplyNotificationEmail(
    to: string,
    pageSlug: string,
    commentId: string,
    pageUrl: string,
  ) {
    const confirmToken = this.tokenService.genAcceptNotifyToken(commentId)
    const confirmLink = `${resolvedConfig.host}/api/open/confirm_reply_notification?token=${confirmToken}`
    await this.emailService.send({
      to,
      from: this.emailService.sender,
      subject: `Please confirm reply notification`,
      html: makeConfirmReplyNotificationTemplate({
        page_slug: pageSlug,
        confirm_url: confirmLink,
        page_url: pageUrl
      }),
    })
    statService.capture('send_reply_confirm_email')
  }

  async sendEmailVerification(
    to: string,
    pageSlugOrTitle: string,
    appId: string,
    commentId?: string,
  ) {
    // NOTE: requires TokenService to support genEmailVerifyToken(payload)
    // If it doesn't exist yet, mirror the implementation of genAcceptNotifyToken
    // but sign a payload like { email, appId }.
    const verifyToken = this.tokenService.genEmailVerifyToken({
      email: to,
      appId,
      commentId,
    })

    const verifyLink = `${resolvedConfig.host}/api/open/confirm_email?token=${verifyToken}`

    await this.emailService.send({
      to,
      from: this.emailService.sender,
      subject: `Please verify your email`,
      html: makeEmailVerificationTemplate({
        page_slug: pageSlugOrTitle,
        confirm_url: verifyLink,
      }),
    })

    statService.capture('send_email_verification')
  }

  async getDeletedComments(
    projectId: string,
    timezoneOffset: number,
    options?: {
      parentId?: string
      page?: number
      pageSize?: number
      select?: Prisma.CommentSelect
    },
  ): Promise<CommentWrapper> {
    const pageSize = options?.pageSize || 10
    const offset = ((options?.page || 1) - 1) * pageSize

    const baseWhere = {
      page: {
        projectId,
      },
      deletedAt: { not: null }, // Only deleted comments
      parentId: options?.parentId || null,
    } as Prisma.CommentWhereInput

    const [comments, commentCount] = await Promise.all([
      prisma.comment.findMany({
        where: baseWhere,
        select: options?.select || {
          id: true,
          content: true,
          by_nickname: true,
          by_email: true,
          createdAt: true,
          deletedAt: true,
          approved: true,
          moderatorId: true,
          page: {
            select: {
              slug: true,
              url: true,
            },
          },
          _count: {
            select: { replies: true }
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: offset,
        take: pageSize,
      }),
      prisma.comment.count({
        where: baseWhere,
      })
    ])

    const pageCount = Math.ceil(commentCount / pageSize) || 1
    
    // Format comments similar to regular getComments
    const formattedComments = comments.map(comment => {
      const formatted = {
        ...comment,
        parsedContent: markdown.render(comment.content || ''),
        parsedCreatedAt: dayjs(comment.createdAt).utcOffset(timezoneOffset / 60).format('YYYY-MM-DD HH:mm:ss'),
        replies: { 
          data: [], 
          commentCount: (comment as any)._count?.replies || 0, 
          pageSize: 0, 
          pageCount: 0 
        }
      }
      return formatted
    })

    return {
      data: formattedComments,
      commentCount,
      pageSize,
      pageCount,
    }
  }

  async cascadeHardDelete(commentIds: string | string[]): Promise<{ deletedCount: number }> {
    const ids = Array.isArray(commentIds) ? commentIds : [commentIds]
    if (ids.length === 0) return { deletedCount: 0 }

    // First, find all replies to these comments (recursively)
    const findAllReplies = async (parentIds: string[]): Promise<string[]> => {
      if (parentIds.length === 0) return []
      
      const replies = await prisma.comment.findMany({
        where: { parentId: { in: parentIds } },
        select: { id: true }
      })
      
      const replyIds = replies.map(reply => reply.id)
      
      // Recursively get replies to these replies
      if (replyIds.length > 0) {
        const nestedReplies = await findAllReplies(replyIds)
        replyIds.push(...nestedReplies)
      }
      
      return replyIds
    }

    // Get all reply IDs for all parent comments
    const allReplyIds = await findAllReplies(ids)
    const allIdsToDelete = [...ids, ...allReplyIds]

    // Hard delete all comments (parents + all descendants)
    const result = await prisma.comment.deleteMany({
      where: {
        id: { in: allIdsToDelete }
      }
    })

    return { deletedCount: result.count }
  }

  async unapprove(commentIds: string | string[]) {
    const ids = Array.isArray(commentIds) ? commentIds : [commentIds]
    if (ids.length === 0) return

    await prisma.comment.updateMany({
      where: { id: { in: ids } },
      data: { approved: false }
    })
  }
}
