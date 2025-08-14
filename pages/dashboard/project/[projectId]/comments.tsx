import { Button, Group, List, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { useAdminFilter } from '../../../../hooks/useAdminFilter'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { AiOutlineCheck, AiOutlineSmile } from 'react-icons/ai'
import { useMutation, useQueryClient } from 'react-query'
import { useQuery } from 'react-query'
import { useWebSocketForQuery, updateCommentList } from '../../../../hooks/useQueryWithWebSocket'
import { AdminPageLayout } from '../../../../components/AdminPageLayout'
import { Comment } from '../../../../components/Comment'
import { UserSession } from '../../../../service'
import { CommentItem, CommentWrapper } from '../../../../service/comment.service'
import { ProjectService } from '../../../../service/project.service'
import { MainLayoutData, ViewDataService } from '../../../../service/viewData.service'
import { apiClient } from '../../../../utils.client'
import { getSession } from '../../../../utils.server'

const getComments = async ({ queryKey }) => {
  const [_key, { projectId, page }] = queryKey
  const res = await apiClient.get<{
    data: CommentWrapper,
  }>(`/project/${projectId}/comments`, {
    params: {
      page,
    }
  })
  return res.data.data
}

const approveComments = async ({ commentIds }) => {
  const res = await apiClient.post('/comment/approve', {
    commentIds
  })
  return res.data
}

const unapproveComments = async ({ commentIds }) => {
  const res = await apiClient.post('/comment/unapprove', {
    commentIds
  })
  return res.data
}

const deleteComments = async ({ commentIds }) => {
  const res = await apiClient.delete('/comment/delete', {
    data: { commentIds }
  })
  return res.data
}


const replyAsModerator = async ({ parentId, content }) => {
  const res = await apiClient.post(`/comment/${parentId}/replyAsModerator`, {
    content
  })
  return res.data.data
}

const deleteProject = async ({ projectId }) => {
  const res = await apiClient.delete<{
    data: string
  }>(`/project/${projectId}`)
  return res.data.data
}

const updateProjectSettings = async ({ projectId, body }) => {
  const res = await apiClient.put(`/project/${projectId}`, body)
  return res.data
}

function CommentToolbar(props: {
  comment: CommentItem,
  refetch: any,
  currentPage: number,
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [replyContent, setReplyContent] = React.useState("")
  const [isOpenReplyForm, setIsOpenReplyForm] = React.useState(false)


  const approveCommentMutation = useMutation((data: { commentId: string }) => approveComments({ commentIds: [data.commentId] }), {
    onSuccess: (result, { commentId }) => {
      // Update UI only after API success
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(comment =>
            comment.id === commentId ? { ...comment, approved: true, isEmailVerified: true } : comment
          )
        }
      })
    },
    onError: (err, { commentId }, context) => {
      // Refetch to ensure consistency after error
      props.refetch()
      notifications.show({
        title: "Error",
        message: 'Failed to approve comment',
        color: 'yellow'
      })
    }
  })

  const unapproveCommentMutation = useMutation((data: { commentId: string }) => unapproveComments({ commentIds: [data.commentId] }), {
    onSuccess: (result, { commentId }) => {
      // Update UI only after API success
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(comment =>
            comment.id === commentId ? { ...comment, approved: false } : comment
          )
        }
      })
    },
    onError: (err, { commentId }, context) => {
      // Refetch to ensure consistency after error
      props.refetch()
      notifications.show({
        title: "Error",
        message: 'Failed to unapprove comment',
        color: 'yellow'
      })
    }
  })
  const replyCommentMutation = useMutation(replyAsModerator, {
    onMutate: async ({ parentId }) => {
      // Cancel any outgoing refetches
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      await queryClient.cancelQueries(queryKey)

      // Snapshot the previous value  
      const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)

      return { previousComments, queryKey, parentId }
    },
    onSuccess: (result, { parentId }, context) => {
      // Update parent comment to approved and verified after API success
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(comment =>
            comment.id === parentId ? { ...comment, approved: true, isEmailVerified: true } : comment
          )
        }
      })

      setIsOpenReplyForm(false)
      // Refetch to get the new reply that was added
      props.refetch()
    },
    onError: (err, { parentId }, context) => {
      // Revert the optimistic update on error (if any was made)
      if (context?.previousComments) {
        queryClient.setQueryData(context.queryKey, context.previousComments)
      }
      props.refetch()
    }
  })
  const deleteCommentMutation = useMutation((data: { commentId: string }) => deleteComments({ commentIds: [data.commentId] }), {
    onSuccess: (result, { commentId }) => {
      // Remove comment from UI only after API success
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.filter(comment => comment.id !== commentId),
          commentCount: Math.max(0, old.commentCount - 1)
        }
      })
    },
    onError: (err, { commentId }, context) => {
      // Refetch to ensure consistency after error
      props.refetch()
      notifications.show({
        title: "Error",
        message: 'Failed to delete comment',
        color: 'red'
      })
    }
  })

  return (
    <Stack>
      <Group spacing={4}>
        {props.comment.approved ? (
          <Button 
            loading={unapproveCommentMutation.isLoading} 
            onClick={_ => {
              unapproveCommentMutation.mutate({
                commentId: props.comment.id
              })
            }} 
            leftIcon={<AiOutlineCheck />} 
            color="green" 
            size="xs" 
            variant={'light'}
          >
            Approved
          </Button>
        ) : (
          <Button loading={approveCommentMutation.isLoading} onClick={_ => {
            if (props.comment.by_email && !props.comment.isEmailVerified) {
              modals.openConfirmModal({
                title: 'Approve unverified comment',
                children: (
                  <Text size="sm">
                    This commenter hasn't verified their email address yet. Approving this comment will also verify their email address ({props.comment.by_email}) for future comments.
                  </Text>
                ),
                labels: { confirm: 'Approve & Verify', cancel: 'Cancel' },
                onConfirm: () => approveCommentMutation.mutate({
                  commentId: props.comment.id
                })
              })
            } else {
              approveCommentMutation.mutate({
                commentId: props.comment.id
              })
            }
          }} leftIcon={<AiOutlineSmile />} size="xs" variant={'subtle'}>
            Approve
          </Button>
        )}
        <Button onClick={_ => {
          setIsOpenReplyForm(!isOpenReplyForm)
        }} size="xs" variant={'subtle'}>
          Reply
        </Button>
        <Button loading={deleteCommentMutation.isLoading} onClick={_ => {
          // if (window.confirm("Are you sure you want to delete this comment?")) {
            deleteCommentMutation.mutate({
              commentId: props.comment.id
            })
          // }
        }} color="red" size="xs" variant={'subtle'}>
          Delete
        </Button>
      </Group>
      {
        isOpenReplyForm &&
        <Stack>
          <Textarea
            autosize
            minRows={2}
            onChange={e => setReplyContent(e.currentTarget.value)}
            placeholder="Reply as moderator"
            sx={{
              // width: 512,
              // maxWidth: '100%'
            }} />
          <Button loading={replyCommentMutation.isLoading} onClick={_ => {
            replyCommentMutation.mutate({
              parentId: props.comment.id,
              content: replyContent
            })
          }} disabled={replyContent.length === 0} size="xs">
            {props.comment.approved ? 'Reply' : 'Reply and approve'}
          </Button>
        </Stack>
      }
    </Stack>
  )
}

function ProjectPage(props: {
  project: ProjectServerSideProps,
  session: UserSession,
  mainLayoutData: MainLayoutData
}) {

  React.useEffect(() => {
    if (!props.session) {
      signIn()
    }
  }, [!props.session])

  if (!props.session) {
    return <div>Redirecting to signin..</div>
  }

  const [page, setPage] = React.useState(1)
  const router = useRouter()
  const queryClient = useQueryClient()

  const queryKey = ['getComments', { projectId: router.query.projectId as string, page }]
  const getCommentsQuery = useQuery(queryKey, getComments)
  
  // Add WebSocket listener for this specific query
  useWebSocketForQuery(router.query.projectId as string, queryKey, updateCommentList)


  // Selection state for batch actions
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<string[]>([])
  const isSelected = React.useCallback((id: string) => selectedCommentIds.includes(id), [selectedCommentIds])
  const toggleSelected = (id: string) => {
    setSelectedCommentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Admin filtering using reusable hook
  const allComments = getCommentsQuery.data?.data || []
  const { hideAdminPosts, setHideAdminPosts, filteredItems: filteredComments } = useAdminFilter(allComments)
  
  const clearSelection = () => setSelectedCommentIds([])

  // Batch approve handler  
  const [isBatchApproving, setIsBatchApproving] = React.useState(false)
  const handleBatchApprove = async () => {
    if (selectedCommentIds.length === 0) return
    
    // Check if any selected comments are from unverified emails
    const selectedComments = filteredComments.filter(comment => selectedCommentIds.includes(comment.id))
    const unverifiedComments = selectedComments.filter(comment => comment.by_email && !comment.isEmailVerified)
    
    if (unverifiedComments.length > 0) {
      const unverifiedEmails = [...new Set(unverifiedComments.map(c => c.by_email))]
      modals.openConfirmModal({
        title: 'Approve comments with unverified emails',
        children: (
          <Stack spacing="xs">
            <Text size="sm">
              {unverifiedComments.length} of the selected comments are from unverified email addresses. Approving these comments will also verify the following email addresses for future comments:
            </Text>
            <Text size="sm" weight={500}>
              {unverifiedEmails.join(', ')}
            </Text>
          </Stack>
        ),
        labels: { confirm: 'Approve & Verify All', cancel: 'Cancel' },
        onConfirm: () => performBatchApprove()
      })
    } else {
      performBatchApprove()
    }
  }

  const performBatchApprove = async () => {
    setIsBatchApproving(true)
    
    try {
      const result = await approveComments({ commentIds: selectedCommentIds })
      
      // Update UI only after successful API call
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(comment =>
            selectedCommentIds.includes(comment.id) ? { ...comment, approved: true, isEmailVerified: true } : comment
          )
        }
      })
      
      notifications.show({ title: 'Approved', message: `Approved ${result.approved} comment(s)`, color: 'green' })
      setSelectedCommentIds([])
    } catch (e) {
      await getCommentsQuery.refetch()
      notifications.show({ title: 'Error', message: 'Approval failed', color: 'red' })
    } finally {
      setIsBatchApproving(false)
    }
  }

  // Batch delete handler
  const [isBatchDeleting, setIsBatchDeleting] = React.useState(false)
  const handleBatchDelete = async () => {
    if (selectedCommentIds.length === 0) return
    setIsBatchDeleting(true)
    
    try {
      const result = await deleteComments({ commentIds: selectedCommentIds })
      
      // Update UI only after successful API call
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.filter(comment => !selectedCommentIds.includes(comment.id)),
          commentCount: Math.max(0, old.commentCount - selectedCommentIds.length)
        }
      })
      
      notifications.show({
        title: 'Deleted',
        message: `Deleted ${result.deleted} comment(s)`,
        color: 'red'
      })
      setSelectedCommentIds([])
    } catch (e) {
      await getCommentsQuery.refetch()
      notifications.show({ title: 'Error', message: 'Delete operation failed', color: 'red' })
    } finally {
      setIsBatchDeleting(false)
    }
  }

  const { commentCount = 0, pageCount = 0 } = getCommentsQuery.data || {}

  // Control bar buttons configuration
  const controlBarButtons = [
    {
      label: `Approve Selected (${selectedCommentIds.length})`,
      color: 'green',
      loading: isBatchApproving,
      disabled: selectedCommentIds.length === 0,
      onClick: handleBatchApprove,
    },
    {
      label: 'Delete Selected',
      color: 'red',
      variant: 'light',
      loading: isBatchDeleting,
      disabled: selectedCommentIds.length === 0,
      onClick: handleBatchDelete,
    },
  ]

  const selectAllOnPage = () => {
    const ids = filteredComments.map((c) => c.id)
    setSelectedCommentIds(ids)
  }

  return (
    <AdminPageLayout
      id="comments"
      project={props.project}
      mainLayoutData={props.mainLayoutData}
      isLoading={getCommentsQuery.isLoading}
      controlBar={{
        selectedCount: selectedCommentIds.length,
        totalCount: filteredComments.length,
        onSelectAll: selectAllOnPage,
        onClearSelection: clearSelection,
        buttons: controlBarButtons,
        showAdminFilter: true,
        hideAdminPosts,
        onToggleAdminFilter: setHideAdminPosts,
        globalCount: commentCount,
        currentPage: page,
        totalPages: pageCount
      }}
      pagination={{
        total: getCommentsQuery.data?.pageCount || 0,
        value: page,
        onChange: setPage
      }}
      emptyState="No comments yet"
    >
      {filteredComments.map(comment => (
        <List.Item key={comment.id}>
          <Comment
            comment={comment}
            showCheckbox={true}
            isSelected={isSelected(comment.id)}
            onToggleSelected={() => toggleSelected(comment.id)}
            actions={
              <CommentToolbar 
                comment={comment} 
                refetch={getCommentsQuery.refetch} 
                currentPage={page} 
              />
            }
          />
        </List.Item>
      ))}
    </AdminPageLayout>
  )
}

type ProjectServerSideProps = Pick<Project, 'ownerId' | 'id' | 'title' | 'token' | 'enableNotification' | 'webhook' | 'enableWebhook'>

export async function getServerSideProps(ctx) {
  const projectService = new ProjectService(ctx.req)
  const session = await getSession(ctx.req)
  const project = await projectService.get(ctx.query.projectId) as Project
  const viewDataService = new ViewDataService(ctx.req)

  if (!session) {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false
      }
    }
  }

  if (project.deletedAt) {
    return {
      redirect: {
        destination: '/404',
        permanent: false
      }
    }
  }

  if (session && (project.ownerId !== session.uid)) {
    return {
      redirect: {
        destination: '/forbidden',
        permanent: false
      }
    }
  }


  return {
    props: {
      session: await getSession(ctx.req),
      mainLayoutData: await viewDataService.fetchMainLayoutData(),
      project: {
        id: project.id,
        title: project.title,
        ownerId: project.ownerId,
        token: project.token,
        enableNotification: project.enableNotification,
        enableWebhook: project.enableWebhook,
        webhook: project.webhook
      } as ProjectServerSideProps
    }

  }
}

export default ProjectPage
