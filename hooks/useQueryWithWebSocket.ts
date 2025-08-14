import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from 'react-query'
import { notifications } from '@mantine/notifications'

interface WebSocketEvent {
  type: 'comment_changed'
  projectId: string
  commentId: string
  newData: any
  action: 'created'
}

type UpdateFunction = (cachedData: any, commentId: string, newData: any) => any

// Simple WebSocket hook that just listens and updates specific queries
export function useQueryWithWebSocket(
  projectId: string | undefined,
  queryKey: unknown[],
  updateFunction: UpdateFunction,
) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Stabilize the update function with useCallback
  const stableUpdateFunction = useCallback(updateFunction, [])

  const connect = useCallback(() => {
    if (!projectId || wsRef.current?.readyState === WebSocket.OPEN || process.env.NODE_ENV === 'development') {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws?projectId=${projectId}`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log(`WebSocket connected for project ${projectId}`)
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const wsEvent: WebSocketEvent = JSON.parse(event.data)

        // Only handle events for this project
        if (wsEvent.projectId !== projectId) return

        // Show notification
        notifications.show({
          title: 'New Comment',
          message: `Comment ${wsEvent.commentId.substring(0, 8)} added`,
          color: 'blue',
          autoClose: 3000,
        })

        // Update the specific query
        const cachedData = queryClient.getQueryData(queryKey)
        if (cachedData) {
          const newCachedData = stableUpdateFunction(
            cachedData,
            wsEvent.commentId,
            wsEvent.newData,
          )
          if (newCachedData !== cachedData) {
            queryClient.setQueryData(queryKey, newCachedData)
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = (event) => {
      console.log(`WebSocket disconnected for project ${projectId}`, event.code)
      setIsConnected(false)
    }
  }, [projectId, queryClient, queryKey, stableUpdateFunction])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmount')
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  useEffect(() => {
    if (projectId && process.env.NODE_ENV !== 'development') {
      connect()
    }
    return disconnect
  }, [projectId, connect, disconnect])

  return { isConnected }
}

// Update functions for handling new comments

export function updateCommentList(cachedData: any, commentId: string, newData: any) {
  if (!cachedData.data || !Array.isArray(cachedData.data)) return cachedData

  // Only add to first page to avoid duplicates
  const [, params] = cachedData.queryKey || [{}, {}]
  if ((params.page || 1) !== 1) return cachedData

  // Check if comment already exists (avoid duplicates)
  const existingIndex = cachedData.data.findIndex((comment: any) => comment.id === commentId)
  if (existingIndex !== -1) return cachedData

  // Add new comment to top of list
  return {
    ...cachedData,
    data: [
      { 
        ...newData, 
        _isWebSocketUpdate: true,
        _webSocketAction: 'created'
      }, 
      ...cachedData.data
    ],
    commentCount: cachedData.commentCount + 1
  }
}

export function updateCommentersList(cachedData: any, _commentId: string, newData: any) {
  if (!cachedData.data || !Array.isArray(cachedData.data)) return cachedData

  let updated = false
  const newCachedData = { ...cachedData }

  newCachedData.data = cachedData.data.map((commenter: any) => {
    // Add comment to existing commenter with matching email
    if (newData.by_email === commenter.email) {
      updated = true
      return {
        ...commenter,
        comments: [
          { 
            ...newData, 
            _isWebSocketUpdate: true,
            _webSocketAction: 'created'
          }, 
          ...commenter.comments.slice(0, 2) // Keep only top 3 comments
        ],
        commentCount: commenter.commentCount + 1
      }
    }

    return commenter
  })

  return updated ? newCachedData : cachedData
}