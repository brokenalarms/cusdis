import { NextApiRequest, NextApiResponse } from "next";
import { UserService } from "../../service/user.service";
import { withUserAuth } from "../../utils/auth-wrappers";

export default withUserAuth(async function handler(req: NextApiRequest, res: NextApiResponse, { session }) {

  const userService = new UserService(req)

  const {
    notificationEmail,
    enableNewCommentNotification,
    displayName
  } = req.body as {
    notificationEmail?: string
    enableNewCommentNotification?: boolean,
    displayName?: string
  }

  await userService.update(session.uid, {
    enableNewCommentNotification,
    notificationEmail,
    displayName
  })

  res.json({
    message: 'success'
  })
}, ['PUT'])