import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'
import { apiHandler, prisma } from '../../../utils.server'
import { TokenBody, SecretKey } from '../../../service/token.service'
import { CommentService } from '../../../service/comment.service'
import { withTokenAuth } from '../../../utils/auth-wrappers'

const okHtml = (body: string) =>
  '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Email verified</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;padding:24px;max-width:680px;margin:40px auto;"><h1 style="margin:0 0 8px;">Email verified ✅</h1><p style="margin:0 0 12px;">Thanks! Your email is now verified.</p><p style="margin:0 0 12px;">If this is your first comment, a moderator will still need to approve it before it appears. After your first approval, future comments from this email will be published automatically once verified.</p>' + body + '<p style="margin:12px 0 0;color:#666;">You can close this window.</p></body></html>'

const handler = withTokenAuth(async (req: NextApiRequest, res: NextApiResponse, { tokenPayload }) => {
  // Health check
  if ((req.query as any).ping === '1') {
    res.status(200).send('ok')
    return
  }

  const payload = tokenPayload as TokenBody.EmailVerify

  // Upsert commenter and set verifiedAt
  await prisma.commenter.upsert({
    where: { email: payload.email },
    update: { verifiedAt: new Date() },
    create: { email: payload.email, verifiedAt: new Date() },
  })

  // If a commentId is present, and there is already a previously approved comment
  // for this email in the same project, approve ONLY that specific pending comment.
  if (payload.commentId) {
    const priorApproved = await prisma.comment.findFirst({
      where: {
        page: { projectId: payload.appId },
        by_email: payload.email,
        approved: true,
      },
      select: { id: true },
    })

    if (priorApproved) {
      // Use CommentService to trigger hooks for admin notification
      const commentService = new CommentService(req)
      try {
        await commentService.approve([payload.commentId])
      } catch (e) {
        console.warn('[confirm_email] failed to approve comment', e)
      }
    }
  }

  res
    .status(200)
    .send(
      okHtml(
        '',
      ),
    )
}, {
  secretKey: SecretKey.EmailVerify,
  allowedMethods: ['GET']
})

export default apiHandler()
  .use(
    Cors({
      methods: ['GET', 'OPTIONS'],
    }),
  )
  .get(handler)