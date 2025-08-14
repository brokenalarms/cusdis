import { NextApiRequest, NextApiResponse } from 'next'
import { UserService } from '../../../service/user.service'
import { UnSubscribeType, TokenBody, SecretKey } from '../../../service/token.service'
import { withTokenAuth } from '../../../utils/auth-wrappers'

export default withTokenAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { tokenPayload }
) {
  const userService = new UserService(req)
  const result = tokenPayload as TokenBody.UnsubscribeNewComment

  switch (result.type) {
    case UnSubscribeType.NEW_COMMENT:
      {
        await userService.update(result.userId, {
          enableNewCommentNotification: false,
        })
      }
      break
  }

  res.send('Unsubscribed!')
}, {
  secretKey: SecretKey.Unsubscribe,
  allowedMethods: ['GET']
})