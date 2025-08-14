import { NextApiRequest, NextApiResponse } from 'next'
import { AuthService } from '../service/auth.service'
import { ProjectService } from '../service/project.service'
import { TokenService, SecretKey } from '../service/token.service'
import { prisma } from '../utils.server'

export function withUserAuth(
  handler: (req: NextApiRequest, res: NextApiResponse, context: { session: any }) => Promise<void>,
  allowedMethods?: string[]
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (allowedMethods && !allowedMethods.includes(req.method!)) {
      return res.status(405).json({ message: 'Method not allowed' })
    }
    
    const authService = new AuthService(req, res)
    const session = await authService.authGuard() // throws on failure
    return handler(req, res, { session })
  }
}

export function withProjectAuth(
  handler: (req: NextApiRequest, res: NextApiResponse, context: { session: any, project: any }) => Promise<void>,
  allowedMethods?: string[],
  options?: { commentId?: boolean }
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (allowedMethods && !allowedMethods.includes(req.method!)) {
      return res.status(405).json({ message: 'Method not allowed' })
    }
    
    const authService = new AuthService(req, res)
    let project
    
    if (options?.commentId) {
      // Get project via commentId
      const { CommentService } = await import('../service/comment.service')
      const commentService = new CommentService(req)
      project = await commentService.getProject(req.query.commentId as string)
    } else {
      // Get project directly via projectId
      const projectService = new ProjectService(req)
      project = await projectService.get(req.query.projectId as string, {
        select: {
          ownerId: true,
          id: true,
        },
      })
    }
    
    const session = await authService.projectOwnerGuard(project) // throws on failure
    
    return handler(req, res, { session, project })
  }
}

type TokenAuthOptions = {
  secretKey?: SecretKey
  projectToken?: boolean
  allowedMethods?: string[]
}

export function withTokenAuth(
  handler: (req: NextApiRequest, res: NextApiResponse, context: { tokenPayload: any, project?: any }) => Promise<void>,
  options: TokenAuthOptions
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (options.allowedMethods && !options.allowedMethods.includes(req.method!)) {
      return res.status(405).json({ message: 'Method not allowed' })
    }
    
    const token = req.query.token as string
    
    if (!token) {
      return res.status(400).json({ message: 'Missing token' })
    }

    try {
      if (options.projectToken) {
        // Project token validation - simple string comparison
        const projectId = req.query.projectId as string
        if (!projectId) {
          return res.status(400).json({ message: 'Missing projectId' })
        }

        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { token: true, id: true }
        })

        if (!project || project.token !== token) {
          return res.status(403).json({ message: 'Invalid token' })
        }

        return handler(req, res, { tokenPayload: { projectId }, project })
        
      } else if (options.secretKey) {
        // JWT token validation
        const tokenService = new TokenService()
        const tokenPayload = tokenService.validate(token, options.secretKey)
        
        return handler(req, res, { tokenPayload })
        
      } else {
        return res.status(500).json({ message: 'Invalid token auth configuration' })
      }
    } catch (error) {
      console.error('Token validation error:', error)
      return res.status(403).json({ message: 'Invalid or expired token' })
    }
  }
}