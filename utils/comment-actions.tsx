import { useMutation, useQueryClient } from 'react-query'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { Text } from '@mantine/core'
import { apiClient } from '../utils.client'
import { CommentItem } from '../service/comment.service'

// Internal API functions - not exported
const approveCommentsAPI = async ({ commentIds }: { commentIds: string[] }) => {
  const res = await apiClient.post('/comment/approve', { commentIds })
  return res.data
}

const unapproveCommentsAPI = async ({ commentIds }: { commentIds: string[] }) => {
  const res = await apiClient.post('/comment/unapprove', { commentIds })
  return res.data
}

const deleteCommentsAPI = async ({ commentIds }: { commentIds: string[] }) => {
  const res = await apiClient.delete('/comment/delete', { data: { commentIds } })
  return res.data
}

const replyAsModeratorAPI = async ({ parentId, content }: { parentId: string, content: string }) => {
  const res = await apiClient.post(`/comment/${parentId}/replyAsModerator`, { content })
  return res.data.data
}

// Update functions for different page contexts
type UpdaterFunction = (old: any, commentId: string, updates: Partial<CommentItem>) => any

export const updateCommentsPage: UpdaterFunction = (old, commentId, updates) => {
  if (!old) return old
  return {
    ...old,
    data: old.data.map((comment: CommentItem) =>
      comment.id === commentId ? { ...comment, ...updates } : comment
    )
  }
}

export const updateCommentersPage: UpdaterFunction = (old, commentId, updates) => {
  if (!old) return old
  return {
    ...old,
    data: old.data.map((commenter: any) => ({
      ...commenter,
      comments: commenter.comments.map((comment: CommentItem) =>
        comment.id === commentId ? { ...comment, ...updates } : comment
      )
    }))
  }
}

// Hook factories
export function useApproveComment(queryKey: any, refetch: any, updater: UpdaterFunction = updateCommentsPage) {
  const queryClient = useQueryClient()
  
  return useMutation(
    (data: { commentId: string }) => approveCommentsAPI({ commentIds: [data.commentId] }),
    {
      onSuccess: (result, { commentId }) => {
        queryClient.setQueryData(queryKey, (old: any) => 
          updater(old, commentId, { approved: true, isEmailVerified: true })
        )
      },
      onError: () => {
        refetch()
        notifications.show({
          title: "Error",
          message: 'Failed to approve comment',
          color: 'yellow'
        })
      }
    }
  )
}

export function useUnapproveComment(queryKey: any, refetch: any, updater: UpdaterFunction = updateCommentsPage) {
  const queryClient = useQueryClient()
  
  return useMutation(
    (data: { commentId: string }) => unapproveCommentsAPI({ commentIds: [data.commentId] }),
    {
      onSuccess: (result, { commentId }) => {
        queryClient.setQueryData(queryKey, (old: any) => 
          updater(old, commentId, { approved: false })
        )
      },
      onError: () => {
        refetch()
        notifications.show({
          title: "Error",
          message: 'Failed to unapprove comment',
          color: 'yellow'
        })
      }
    }
  )
}

export function useReplyToComment(queryKey: any, refetch: any, updater: UpdaterFunction = updateCommentsPage) {
  const queryClient = useQueryClient()
  
  return useMutation(replyAsModeratorAPI, {
    onMutate: async ({ parentId }) => {
      await queryClient.cancelQueries(queryKey)
      const previousData = queryClient.getQueryData(queryKey)
      return { previousData, queryKey, parentId }
    },
    onSuccess: (result, { parentId }, context) => {
      queryClient.setQueryData(queryKey, (old: any) => 
        updater(old, parentId, { approved: true, isEmailVerified: true })
      )
      refetch()
    },
    onError: (err, { parentId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(context.queryKey, context.previousData)
      }
      refetch()
    }
  })
}

export function useDeleteComment(queryKey: any, refetch: any) {
  return useMutation(
    (data: { commentId: string }) => deleteCommentsAPI({ commentIds: [data.commentId] }),
    {
      onSuccess: () => {
        refetch()
      }
    }
  )
}

// Helper function for approve with verification modal
export function handleApproveWithVerificationCheck(
  comment: CommentItem, 
  approveMutation: any
) {
  if (comment.by_email && !comment.isEmailVerified) {
    modals.openConfirmModal({
      title: 'Approve unverified comment',
      children: (
        <Text size="sm">
          This commenter hasn't verified their email address yet. Approving this comment will also verify their email address ({comment.by_email}) for future comments.
        </Text>
      ),
      labels: { confirm: 'Approve & Verify', cancel: 'Cancel' },
      onConfirm: () => approveMutation.mutate({ commentId: comment.id })
    })
  } else {
    approveMutation.mutate({ commentId: comment.id })
  }
}