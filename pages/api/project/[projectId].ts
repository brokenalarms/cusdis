import { NextApiRequest, NextApiResponse } from "next";
import { ProjectService } from "../../../service/project.service";
import { prisma } from "../../../utils.server";
import { withProjectAuth } from "../../../utils/auth-wrappers";

export default withProjectAuth(async function handler(req: NextApiRequest, res: NextApiResponse, { session: _session, project, mainLayoutData: _mainLayoutData }) {
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (req.method === 'PUT') {
    const body = req.body as {
      enableNotification?: boolean,
      webhookUrl?: string,
      enableWebhook?: boolean
    }

    await prisma.project.update({
      where: {
        id: project.id,
      },
      data: {
        enableNotification: body.enableNotification,
        enableWebhook: body.enableWebhook,
        webhook: body.webhookUrl
      },
    })

    res.json({
      message: 'success'
    })
  } else if (req.method === 'DELETE') {
    const projectService = new ProjectService(req)
    await projectService.delete(project.id)

    res.json({
      message: 'success'
    })
  }
})