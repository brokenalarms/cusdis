import { NextApiRequest } from 'next'
import { WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'
import { parse } from 'url'

// Store active WebSocket connections by project ID
const connections = new Map<string, Set<WebSocket>>()

// Initialize WebSocket server globally
function initializeWebSocketServer(server: any) {
  if (!server.wss) {
    console.log('Initializing WebSocket server')
    const wss = new WebSocketServer({ noServer: true })
    server.wss = wss

    server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      const { pathname, query } = parse(request.url!, true)
      
      if (pathname === '/api/ws') {
        const requestProjectId = query.projectId as string
        if (!requestProjectId) {
          socket.destroy()
          return
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          // Add connection to project's set
          if (!connections.has(requestProjectId)) {
            connections.set(requestProjectId, new Set())
          }
          connections.get(requestProjectId)!.add(ws)
          
          console.log(`WebSocket connected for project ${requestProjectId}. Total connections:`, connections.get(requestProjectId)!.size)

          ws.on('close', () => {
            // Remove connection from project's set
            const projectConnections = connections.get(requestProjectId)
            if (projectConnections) {
              projectConnections.delete(ws)
              if (projectConnections.size === 0) {
                connections.delete(requestProjectId)
              }
            }
            console.log(`WebSocket disconnected for project ${requestProjectId}`)
          })

          ws.on('error', (error) => {
            console.error(`WebSocket error for project ${requestProjectId}:`, error)
          })

          // Send connection confirmation
          ws.send(JSON.stringify({ 
            type: 'connection_established', 
            projectId: requestProjectId 
          }))
        })
      } else {
        socket.destroy()
      }
    })
  }
}

export default function handler(req: NextApiRequest, res: any) {
  const { projectId } = req.query
  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'Project ID required' })
    return
  }

  // Initialize WebSocket server on first request
  initializeWebSocketServer(res.socket.server)

  res.status(200).json({ message: 'WebSocket server ready' })
}

// Export function to broadcast updates to all connections for a project
export function broadcastToProject(projectId: string, event: {
  type: 'comment_changed'
  projectId: string
  commentId: string
  newData: any | null
  action: 'created' | 'updated' | 'deleted' | 'restored'
}) {
  const projectConnections = connections.get(projectId)
  if (!projectConnections || projectConnections.size === 0) {
    console.log(`No WebSocket connections for project ${projectId}`)
    return
  }

  const message = JSON.stringify(event)
  let sentCount = 0
  
  projectConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
      sentCount++
    } else {
      // Clean up dead connections
      projectConnections.delete(ws)
    }
  })
  
  console.log(`Broadcasted comment change to ${sentCount} connections for project ${projectId}`)
}

export const config = {
  api: {
    bodyParser: false,
  },
}