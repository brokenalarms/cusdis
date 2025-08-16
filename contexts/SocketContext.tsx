import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useRouter } from 'next/router'
import { notifications } from '@mantine/notifications'

type CommentMergeHandler = (comment?: any) => void

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  registerCommentHandler: (handler: CommentMergeHandler) => void
  unregisterCommentHandler: (handler: CommentMergeHandler) => void
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  registerCommentHandler: () => {},
  unregisterCommentHandler: () => {},
})

export const useSocket = () => useContext(SocketContext)

// Custom hook for pages to register their comment merge handlers
export const useSocketCommentHandler = (handler: CommentMergeHandler) => {
  const { registerCommentHandler, unregisterCommentHandler } = useSocket()
  
  useEffect(() => {
    registerCommentHandler(handler)
    return () => unregisterCommentHandler(handler)
  }, [handler, registerCommentHandler, unregisterCommentHandler])
}

interface SocketProviderProps {
  children: ReactNode
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [commentHandlers, setCommentHandlers] = useState<Set<CommentMergeHandler>>(new Set())
  const router = useRouter()

  const registerCommentHandler = useCallback((handler: CommentMergeHandler) => {
    setCommentHandlers(prev => new Set(prev).add(handler))
  }, [])

  const unregisterCommentHandler = useCallback((handler: CommentMergeHandler) => {
    setCommentHandlers(prev => {
      const newSet = new Set(prev)
      newSet.delete(handler)
      return newSet
    })
  }, [])

  useEffect(() => {
    // Only connect if we're in the dashboard area and WebSockets are enabled
    if (!router.pathname.startsWith('/dashboard')) {
      return
    }

    const socketInstance = io({
      path: '/socket.io/',
      timeout: 5000, // Quick timeout to fail fast if WebSockets not supported
    })

    socketInstance.on('connect', () => {
      setIsConnected(true)
    })

    socketInstance.on('disconnect', () => {
      setIsConnected(false)
    })

    socketInstance.on('connect_error', (error) => {
      console.log('WebSocket connection failed - server may not support WebSockets:', error.message)
      setIsConnected(false)
    })

    // Listen for new comments
    socketInstance.on('new-comment', (data) => {
      
      // Show notification toast
      notifications.show({
        title: 'New Comment',
        message: `New comment by ${data.comment.by_nickname || 'Anonymous'}`,
        color: 'blue',
        autoClose: 5000,
      })

      // Call all registered comment handlers
      commentHandlers.forEach(handler => {
        try {
          handler(data.comment)
        } catch (error) {
          console.error('Error in comment handler:', error)
        }
      })
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.close()
    }
  }, [router.pathname, commentHandlers])

  // Join/leave project rooms based on current route
  useEffect(() => {
    if (!socket || !isConnected) return

    const { projectId } = router.query
    if (projectId && typeof projectId === 'string') {
      socket.emit('join-project', projectId)

      return () => {
        socket.emit('leave-project', projectId)
      }
    }
  }, [socket, isConnected, router.query.projectId])

  return (
    <SocketContext.Provider value={{ 
      socket, 
      isConnected, 
      registerCommentHandler, 
      unregisterCommentHandler 
    }}>
      {children}
    </SocketContext.Provider>
  )
}