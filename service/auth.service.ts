import { Project } from '@prisma/client'
import { RequestScopeService } from '.'

export class AuthService extends RequestScopeService {
  constructor(req, private res) {
    super(req)
  }

  async authGuard() {
    const session = await this.getSession()
    if (!session) {
      this.res.status(403).json({
        message: 'Sign in required',
      })
      return null
    }
    return session
  }

  async projectOwnerGuard(project: Pick<Project, 'ownerId'>) {
    const session = await this.getSession()
    
    if (!session) {
      this.res.status(401).json({
        message: 'Sign in required',
      })
      throw new Error('Unauthorized')
    }

    if (project.ownerId !== session.uid) {
      this.res.status(403).json({
        message: 'Permission denied',
      })
      throw new Error('Forbidden')
    }

    return session
  }
}
