import { NextApiRequest, NextApiResponse } from "next";
import { ProjectService } from "../../service/project.service";
import { withUserAuth } from "../../utils/auth-wrappers";

export default withUserAuth(async function handler(req: NextApiRequest, res: NextApiResponse, { session }) {
  const projectService = new ProjectService(req)

  if (req.method === 'POST') {

    const { title } = req.body as {
      title: string
    }

    const created = await projectService.create(title)

    res.json({
      data: {
        id: created.id
      }
    })
  } else if (req.method === 'GET') {
    const projects = await projectService.list()
    res.json({
      data: projects
    })
  }
}