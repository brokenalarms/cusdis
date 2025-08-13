import { NextApiRequest, NextApiResponse } from 'next'
import { AuthService } from '../service/auth.service'
import { ProjectService } from '../service/project.service'

export function withUserAuth(handler: (req: NextApiRequest, res: NextApiResponse, context: { session: any }) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const authService = new AuthService(req, res)
    const session = await authService.authGuard() // throws on failure
    return handler(req, res, { session })
  }
}

export function withProjectAuth(handler: (req: NextApiRequest, res: NextApiResponse, context: { session: any, project: any }) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const authService = new AuthService(req, res)
    const projectService = new ProjectService(req)
    
    const project = await projectService.get(req.query.projectId as string, {
      select: {
        ownerId: true,
        id: true,
      },
    })
    const session = await authService.projectOwnerGuard(project) // throws on failure
    
    return handler(req, res, { session, project })
  }
}