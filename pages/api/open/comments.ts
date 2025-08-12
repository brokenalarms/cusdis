import Cors from 'cors'
import {
  CommentService,
  CommentWrapper,
} from '../../../service/comment.service'
import { ProjectService } from '../../../service/project.service'
import { statService } from '../../../service/stat.service'
import { apiHandler } from '../../../utils.server'
import { prisma } from '../../../utils.server'

export default apiHandler()
  .use(
    Cors({
      // Only allow requests with GET, POST and OPTIONS
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  )
  .get(async (req, res) => {
    const commentService = new CommentService(req)
    const projectService = new ProjectService(req)

    // get all comments
    const query = req.query as {
      page?: string
      appId: string
      pageId: string
    }

    const timezoneOffsetInHour = req.headers['x-timezone-offset']

    const isDeleted = await projectService.isDeleted(query.appId)

    if (isDeleted) {
      res.status(404)
      res.json({
        data: {
          commentCount: 0,
          data: [],
          pageCount: 0,
          pageSize: 10,
        } as CommentWrapper,
      })
      return
    }

    statService.capture('get_comments', {
      identity: query.appId,
      properties: {
        from: 'open_api',
      },
    })

    const queryCommentStat = statService.start(
      'query_comments',
      'Query Comments',
      {
        tags: {
          project_id: query.appId,
          from: 'open_api',
        },
      },
    )

    const comments = await commentService.getComments(
      query.appId,
      Number(timezoneOffsetInHour),
      {
        approved: true,
        parentId: null,
        pageSlug: query.pageId,
        page: Number(query.page) || 1,
        select: {
          by_nickname: true,
          moderator: {
            select: {
              displayName: true,
            },
          },
        },
      },
    )

    queryCommentStat.end()

    res.json({
      data: comments,
    })
  })
  .post(async (req, res) => {
    const commentService = new CommentService(req)
    const projectService = new ProjectService(req)
    // add comment
    const body = req.body as {
      parentId?: string
      appId: string
      pageId: string
      content: string
      acceptNotify?: boolean
      email: string
      nickname: string
      pageUrl?: string
      pageTitle?: string
    }

    // Anti-spam traps: return 204 (silent success) so bots think it worked
    const bodyAny = req.body as any

    // 1) Legacy fixed-name honeypot
    const legacyHoney =
      bodyAny.required_field || bodyAny.website || bodyAny.honey || bodyAny.hp
    if (typeof legacyHoney === 'string' && legacyHoney.trim() !== '') {
      res.status(204).end()
      return
    }

    // 2) Rotating-name honeypot sent as { honey: { n, v } }
    if (
      bodyAny.honey &&
      typeof bodyAny.honey.v === 'string' &&
      bodyAny.honey.v.trim() !== ''
    ) {
      res.status(204).end()
      return
    }

    // 3) Checkbox trap must remain unchecked
    if (bodyAny.trapChecked === true) {
      res.status(204).end()
      return
    }

    // 4) Time trap: reject submits that happen too fast after render
    const now = Date.now()
    const renderedAtNum = Number(bodyAny.renderedAt)
    const submittedAtNum = Number(bodyAny.submittedAt) || now
    if (!Number.isNaN(renderedAtNum) && submittedAtNum - renderedAtNum < 1500) {
      res.status(204).end()
      return
    }

    const isDeleted = await projectService.isDeleted(body.appId)

    if (isDeleted) {
      res.status(404)
      res.json({
        message: 'Project not found',
      })
      return
    }

    // Determine if this email should be auto-approved
    let shouldAutoApprove = false
    let hasVerifiedEmail = false
    try {
      if (body.email) {
        // If the email belongs to a verified user
        // AND has a previously admin-approved comment in this project
        const verifiedUser = await prisma.user.findFirst({
          where: {
            email: body.email,
            emailVerified: { not: null },
          },
          select: { id: true },
        })

        const priorApproved = await prisma.comment.findFirst({
          where: {
            page: {
              projectId: body.appId, // This is the Project.id
            },
            by_email: body.email,
            approved: true,
          },
          select: { id: true },
        })
        hasVerifiedEmail = Boolean(verifiedUser)
        shouldAutoApprove = Boolean(verifiedUser && priorApproved)
      }
    } catch (e) {
      // If the allowlist check fails for any reason, fall back to default behavior
      console.warn('allowlist check failed', e)
    }

    const comment = await commentService.addComment(
      body.appId,
      body.pageId,
      {
        content: body.content,
        email: body.email,
        nickname: body.nickname,
        pageTitle: body.pageTitle,
        pageUrl: body.pageUrl,
      },
      body.parentId,
    )

    let isAutoApproved = false
    try {
      if (shouldAutoApprove && comment && comment.approved !== true) {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { approved: true },
        })
        comment.approved = true
      }
      isAutoApproved = comment && comment.approved === true
    } catch (e) {
      console.warn('auto-approve update failed', e)
    }

    // If this commenter isn't auto-approved yet, or they have verified their email, send a one-time email verification
    if (!isAutoApproved && body.email && !hasVerifiedEmail) {
      const pageLabel = body.pageTitle || body.pageId
      console.log('[comments] sending verify email', {
        email: body.email,
        isAutoApproved,
        hasVerifiedEmail,
        appId: body.appId,
        commentId: comment.id,
        pageLabel,
      })
      commentService.sendEmailVerification(
        body.email,
        pageLabel,
        body.appId,
        comment.id,
      ).then(() => {
        console.log('[comments] verify email queued OK', { email: body.email, commentId: comment.id })
      }).catch((e) => {
        console.warn('[comments] verify email failed', e)
      })
    } else {
      console.log('[comments] skip verify email', { isAutoApproved, hasVerifiedEmail, hasEmail: Boolean(body.email) })
    }

    // send confirm email
    if (body.acceptNotify === true && body.email) {
      console.log('[comments] sending confirm-reply email', { email: body.email, commentId: comment.id })
      commentService.sendConfirmReplyNotificationEmail(
        body.email,
        body.pageTitle,
        comment.id,
      )
    }

    statService.capture('add_comment')

    res.json({
      data: comment,
      isAutoApproved,
    })
  })
