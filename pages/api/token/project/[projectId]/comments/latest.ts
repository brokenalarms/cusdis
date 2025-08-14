import { NextApiRequest, NextApiResponse } from "next";
import { ProjectService } from "../../../../../../service/project.service";
import { withTokenAuth } from "../../../../../../utils/auth-wrappers";

export default withTokenAuth(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { tokenPayload, project }
) {
  const projectService = new ProjectService(req)
  const { projectId } = tokenPayload

  const comments = await projectService.fetchLatestComment(projectId, {
    from: project.fetchLatestCommentsAt,
    markAsRead: true
  })

  res.json({
    comments: comments
  })
}, {
  projectToken: true,
  allowedMethods: ['GET']
})