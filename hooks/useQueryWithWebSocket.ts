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

// Connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// Simple WebSocket hook that just listens and updates specific queries
export function useQueryWithWebSocket(
  projectId: string | undefined,
  queryKey: unknown[],
  updateFunction: UpdateFunction,
) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected')
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const lastConnectAttemptRef = useRef<number>(0)
  const connectDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Stabilize the update function with useCallback
  const stableUpdateFunction = useCallback(updateFunction, [])

  // Create WebSocket connection with debouncing
  const connect = useCallback(async () => {
    if (
      !projectId ||
      connectionState === 'connecting' ||
      connectionState === 'connected'
    ) {
      return
    }

    // Debounce rapid connection attempts (especially during HMR)
    const now = Date.now()
    const timeSinceLastAttempt = now - lastConnectAttemptRef.current
    const minInterval = 2000 // Minimum 2 seconds between connection attempts

    if (timeSinceLastAttempt < minInterval) {
      if (connectDebounceRef.current) {
        clearTimeout(connectDebounceRef.current)
      }

      connectDebounceRef.current = setTimeout(() => {
        connect()
      }, minInterval - timeSinceLastAttempt)
      return
    }

    lastConnectAttemptRef.current = now
    setConnectionState('connecting')

    try {
      // Initialize server first
      await fetch(`/api/ws?projectId=${projectId}`)

      // Small delay to ensure server is ready
      await new Promise((resolve) => setTimeout(resolve, 100))

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/ws?projectId=${projectId}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log(`WebSocket connected for project ${projectId}`)
        setConnectionState('connected')
        reconnectAttemptsRef.current = 0 // Reset reconnect attempts on successful connection
      }

      ws.onmessage = (event) => {
        try {
          const wsEvent: WebSocketEvent = JSON.parse(event.data)

          // Only handle new comments for this project
          if (wsEvent.projectId !== projectId || wsEvent.action !== 'created')
            return

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
        setConnectionState('disconnected')
      }

      ws.onclose = (event) => {
        console.log(
          `WebSocket disconnected for project ${projectId}`,
          event.code,
          event.reason,
        )
        setConnectionState('disconnected')

        // Don't auto-reconnect in development when HMR is active
        const isDevelopment = process.env.NODE_ENV === 'development'
        const isAbnormalClosure = event.code === 1006
        const isHMRClosure = isDevelopment && isAbnormalClosure

        // Auto-reconnect with exponential backoff (unless it was a clean close or HMR in dev)
        if (
          event.code !== 1000 &&
          !isHMRClosure &&
          reconnectAttemptsRef.current < 5
        ) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptsRef.current),
            10000,
          )
          console.log(
            `Reconnecting in ${delay}ms (attempt ${
              reconnectAttemptsRef.current + 1
            })`,
          )

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            setConnectionState('reconnecting')
            connect()
          }, delay)
        } else if (isHMRClosure) {
          console.log(
            'WebSocket closed due to HMR - will reconnect on next stable state',
          )
        }
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      setConnectionState('disconnected')
    }
  }, [projectId, connectionState, queryClient, queryKey, stableUpdateFunction])

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (connectDebounceRef.current) {
      clearTimeout(connectDebounceRef.current)
      connectDebounceRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmount') // Clean close
      wsRef.current = null
    }

    setConnectionState('disconnected')
    reconnectAttemptsRef.current = 0
  }, [])

  // Main effect - only depend on projectId to avoid unnecessary re-runs
  useEffect(() => {
    if (!projectId) {
      disconnect()
      return
    }

    // Connect if not already connected/connecting
    if (connectionState === 'disconnected') {
      connect()
    }

    // Cleanup on unmount or projectId change
    return disconnect
  }, [projectId]) // Only projectId as dependency

  // Separate effect for reconnection when connection state changes
  useEffect(() => {
    if (connectionState === 'reconnecting') {
      connect()
    }
  }, [connectionState, connect])

  // Effect to handle HMR reconnection - wait for HMR to settle then reconnect
  useEffect(() => {
    if (connectionState === 'disconnected' && projectId) {
      // In development, wait a bit longer for HMR to settle before reconnecting
      const isDevelopment = process.env.NODE_ENV === 'development'
      const delay = isDevelopment ? 3000 : 1000

      const reconnectTimer = setTimeout(() => {
        if (connectionState === 'disconnected') {
          console.log('Attempting to reconnect after HMR settlement')
          connect()
        }
      }, delay)

      return () => clearTimeout(reconnectTimer)
    }
  }, [connectionState, projectId, connect])
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