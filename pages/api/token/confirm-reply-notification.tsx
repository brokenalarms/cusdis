import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'
import { apiHandler, prisma } from '../../../utils.server'
import { TokenBody, SecretKey } from '../../../service/token.service'
import { withTokenAuth } from '../../../utils/auth-wrappers'

// HTML success page that shows correct status for subscribe/unsubscribe
const okHtml = (isUnsubscribe: boolean = false) => {
  const title = isUnsubscribe ? 'Reply notifications disabled' : 'Reply notifications enabled'
  const heading = isUnsubscribe ? 'Notifications disabled ❌' : 'Notifications enabled ✅'
  const message = isUnsubscribe 
    ? 'You have been unsubscribed from reply notifications for this thread.' 
    : 'Thanks! We\'ll email you when someone replies to your comment.'
  
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;padding:24px;max-width:680px;margin:40px auto;"><h1 style="margin:0 0 8px;">${heading}</h1><p style="margin:0 0 12px;">${message}</p><p style="margin:12px 0 0;color:#666;">You can close this window.</p></body></html>`
}

const handler = withTokenAuth(async (req: NextApiRequest, res: NextApiResponse, { tokenPayload }) => {
  // Health check
  if ((req.query as any).ping === '1') {
    res.status(200).send('ok')
    return
  }

  const payload = tokenPayload as TokenBody.AcceptNotifyToken
  const isUnsub = (req.query as any).unsubscribe === '1'

  // Persist opt-in on the original comment (or clear it for unsubscribe)
  await prisma.comment.update({
    where: { id: payload.commentId },
    data: { notifyConfirmedAt: isUnsub ? null : new Date() },
  })

  res.status(200).send(okHtml(isUnsub))
}, {
  secretKey: SecretKey.AcceptNotify,
  allowedMethods: ['GET']
})

export default apiHandler()
  .use(
    Cors({
      methods: ['GET', 'OPTIONS'],
    }),
  )
  .get(handler)