import { Anchor, Box, Button, Center, Group, List, Stack, Text, Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { isAdmin } from '../../../../utils/adminHelpers'
import { MODFlag } from '../../../../components/MODFlag'
import { useAdminFilter } from '../../../../hooks/useAdminFilter'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { AiOutlineReload, AiOutlineDelete } from 'react-icons/ai'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { AdminPageLayout } from '../../../../components/AdminPageLayout'
import { UserSession } from '../../../../service'
import { CommentItem, CommentWrapper } from '../../../../service/comment.service'
import { ProjectService } from '../../../../service/project.service'
import { MainLayoutData, ViewDataService } from '../../../../service/viewData.service'
import { apiClient } from '../../../../utils.client'
import { getSession } from '../../../../utils.server'

const getDeletedComments = async ({ queryKey }) => {
  const [_key, { projectId, page }] = queryKey
  const res = await apiClient.get<{
    data: CommentWrapper,
  }>(`/project/${projectId}/deleted-comments`, {
    params: {
      page,
    }
  })
  return res.data.data
}

const hardDeleteComments = async ({ commentIds }) => {
  const res = await apiClient.delete('/comment/hard-delete', {
    data: { commentIds }
  })
  return res.data
}

const restoreComments = async ({ commentIds }) => {
  const res = await apiClient.post('/comment/restore', {
    commentIds
  })
  return res.data
}


function DeletedCommentsPage(props: {
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

  const getDeletedCommentsQuery = useQuery(['getDeletedComments', { projectId: router.query.projectId as string, page }], getDeletedComments, {
  })

  // Selection state for batch actions
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<string[]>([])
  
  // Admin filtering using reusable hook
  const allComments = getDeletedCommentsQuery.data?.data || []
  const { hideAdminPosts, setHideAdminPosts, filteredItems: filteredComments } = useAdminFilter(allComments)
  
  // Individual action mutations
  const restoreCommentMutation = useMutation((data: { commentId: string }) => restoreComments({ commentIds: [data.commentId] }), {
    onSuccess: (result, { commentId }) => {
      const queryKey = ['getDeletedComments', { projectId: router.query.projectId as string, page }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.filter(comment => comment.id !== commentId),
          commentCount: Math.max(0, old.commentCount - 1)
        }
      })
      notifications.show({
        title: 'Restored',
        message: 'Comment restored successfully',
        color: 'green'
      })
    },
    onError: () => {
      getDeletedCommentsQuery.refetch()
      notifications.show({
        title: "Error",
        message: 'Failed to restore comment',
        color: 'red'
      })
    }
  })

  const hardDeleteCommentMutation = useMutation((data: { commentId: string }) => hardDeleteComments({ commentIds: [data.commentId] }), {
    onSuccess: (result, { commentId }) => {
      const queryKey = ['getDeletedComments', { projectId: router.query.projectId as string, page }]
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.filter(comment => comment.id !== commentId),
          commentCount: Math.max(0, old.commentCount - 1)
        }
      })
      notifications.show({
        title: 'Permanently Deleted',
        message: `Permanently deleted comment and ${result.deletedCount - 1} replies`,
        color: 'red'
      })
    },
    onError: () => {
      getDeletedCommentsQuery.refetch()
      notifications.show({
        title: "Error",
        message: 'Failed to permanently delete comment',
        color: 'red'
      })
    }
  })
  const isSelected = React.useCallback((id: string) => selectedCommentIds.includes(id), [selectedCommentIds])
  const toggleSelected = (id: string) => {
    setSelectedCommentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const selectAllOnPage = () => {
    const ids = filteredComments.map((c) => c.id)
    setSelectedCommentIds(ids)
  }
  const clearSelection = () => setSelectedCommentIds([])

  // Batch hard delete handler
  const queryClient = useQueryClient()
  const [isBatchHardDeleting, setIsBatchHardDeleting] = React.useState(false)
  const handleBatchHardDelete = async () => {
    if (selectedCommentIds.length === 0) return
    
    // Show confirmation dialog
    modals.openConfirmModal({
      title: 'Permanently delete selected comments',
      children: (
        <Text size="sm">
          Are you sure you want to permanently delete {selectedCommentIds.length} comment(s)? This action cannot be undone and will also delete all replies to these comments.
        </Text>
      ),
      labels: { confirm: 'Permanently Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => performBatchHardDelete()
    })
  }

  const performBatchHardDelete = async () => {
    setIsBatchHardDeleting(true)
    
    // Optimistic update
    const queryKey = ['getDeletedComments', { projectId: router.query.projectId as string, page }]
    const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)
    
    queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        data: old.data.filter(comment => !selectedCommentIds.includes(comment.id)),
        commentCount: Math.max(0, old.commentCount - selectedCommentIds.length)
      }
    })

    try {
      const result = await hardDeleteComments({ commentIds: selectedCommentIds })
      notifications.show({
        title: 'Permanently Deleted',
        message: `Permanently deleted ${result.deletedCount} comment(s) and replies`,
        color: 'red'
      })
      setSelectedCommentIds([])
    } catch (e) {
      // Revert optimistic update on error
      if (previousComments) {
        queryClient.setQueryData(queryKey, previousComments)
      }
      await getDeletedCommentsQuery.refetch()
      notifications.show({ title: 'Error', message: 'Hard delete operation failed', color: 'red' })
    } finally {
      setIsBatchHardDeleting(false)
    }
  }

  // Batch restore handler
  const [isBatchRestoring, setIsBatchRestoring] = React.useState(false)
  const handleBatchRestore = async () => {
    if (selectedCommentIds.length === 0) return
    setIsBatchRestoring(true)
    
    const queryKey = ['getDeletedComments', { projectId: router.query.projectId as string, page }]
    const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)

    try {
      const result = await restoreComments({ commentIds: selectedCommentIds })
      
      // Update UI only after successful API call
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.filter(comment => !selectedCommentIds.includes(comment.id)),
          commentCount: Math.max(0, old.commentCount - selectedCommentIds.length)
        }
      })
      
      notifications.show({
        title: 'Restored',
        message: `Restored ${result.restored} comment(s)`,
        color: 'green'
      })
      setSelectedCommentIds([])
    } catch (e) {
      await getDeletedCommentsQuery.refetch()
      notifications.show({ title: 'Error', message: 'Restore operation failed', color: 'red' })
    } finally {
      setIsBatchRestoring(false)
    }
  }

  const controlBarButtons = [
    {
      label: `Restore Selected (${selectedCommentIds.length})`,
      color: 'green',
      loading: isBatchRestoring,
      disabled: selectedCommentIds.length === 0,
      onClick: handleBatchRestore,
    },
    {
      label: `Hard Delete Selected (${selectedCommentIds.length})`,
      color: 'red',
      variant: 'light',
      loading: isBatchHardDeleting,
      disabled: selectedCommentIds.length === 0,
      onClick: handleBatchHardDelete,
    },
  ]

  return (
    <AdminPageLayout
      id="deleted-comments"
      project={props.project}
      mainLayoutData={props.mainLayoutData}
      isLoading={getDeletedCommentsQuery.isLoading}
      controlBar={{
        selectedCount: selectedCommentIds.length,
        totalCount: filteredComments.length,
        onSelectAll: selectAllOnPage,
        onClearSelection: clearSelection,
        buttons: controlBarButtons,
        showAdminFilter: true,
        hideAdminPosts,
        onToggleAdminFilter: setHideAdminPosts,
        globalCount: getDeletedCommentsQuery.data?.commentCount,
        currentPage: page,
        totalPages: getDeletedCommentsQuery.data?.pageCount || 0,
      }}
      pagination={{
        total: getDeletedCommentsQuery.data?.pageCount || 0,
        value: page,
        onChange: setPage,
      }}
      emptyState="No deleted comments"
    >
      {filteredComments.map((comment) => (
        <List.Item key={comment.id}>
          <Group align="flex-start" spacing={12}>
            <Checkbox
              aria-label="Select comment"
              checked={isSelected(comment.id)}
              onChange={() => toggleSelected(comment.id)}
            />
            <Stack>
              <Stack spacing={4}>
                <Group
                  spacing={8}
                  sx={{
                    fontSize: 14,
                  }}
                >
                  <Text
                    sx={{
                      fontWeight: 500,
                      color: 'red',
                    }}
                  >
                    [DELETED] {comment.by_nickname}
                  </Text>
                  {isAdmin(comment) && <MODFlag />}
                  <Text
                    sx={{
                      fontWeight: 400,
                      color: 'gray',
                    }}
                  >
                    {comment.by_email}
                  </Text>
                  {comment.by_email && !comment.isEmailVerified && (
                    <Text
                      sx={{
                        fontWeight: 500,
                        color: 'orange',
                        fontSize: 11,
                      }}
                    >
                      UNVERIFIED
                    </Text>
                  )}
                </Group>
                <Group
                  spacing={8}
                  sx={{
                    fontSize: 12,
                  }}
                >
                  <Text sx={{}}>{comment.parsedCreatedAt}</Text>
                  <Text>on</Text>
                  <Anchor href={comment.page.url} target="_blank">
                    {comment.page.slug}
                  </Anchor>
                </Group>
                <Box
                  sx={{
                    marginTop: 8,
                    padding: 8,
                    backgroundColor: '#f8f8f8',
                    borderLeft: '4px solid #red',
                    fontStyle: 'italic',
                  }}
                >
                  {comment.content}
                </Box>
                {comment.replies.commentCount > 0 && (
                  <Text size="xs" color="dimmed" sx={{ marginTop: 8 }}>
                    {comment.replies.commentCount} repl
                    {comment.replies.commentCount === 1 ? 'y' : 'ies'} (will be
                    affected by restore/delete)
                  </Text>
                )}
              </Stack>
              <Group sx={{ alignSelf: 'flex-start' }}>
                <Button
                  loading={
                    restoreCommentMutation.isLoading &&
                    restoreCommentMutation.variables?.commentId === comment.id
                  }
                  onClick={() =>
                    restoreCommentMutation.mutate({ commentId: comment.id })
                  }
                  leftIcon={<AiOutlineReload />}
                  color="green"
                  size="xs"
                  variant={'light'}
                >
                  Restore
                </Button>
                <Button
                  loading={
                    hardDeleteCommentMutation.isLoading &&
                    hardDeleteCommentMutation.variables?.commentId ===
                      comment.id
                  }
                  onClick={() => {
                    modals.openConfirmModal({
                      title: 'Permanently delete comment',
                      children: (
                        <Stack spacing="xs">
                          <Text size="sm">
                            Are you sure you want to permanently delete this
                            comment? This action cannot be undone.
                          </Text>
                          {comment.replies.commentCount > 0 && (
                            <Text size="sm" weight={500} color="red">
                              This will also permanently delete{' '}
                              {comment.replies.commentCount} repl
                              {comment.replies.commentCount === 1 ? 'y' : 'ies'}
                              .
                            </Text>
                          )}
                        </Stack>
                      ),
                      labels: {
                        confirm: 'Permanently Delete',
                        cancel: 'Cancel',
                      },
                      confirmProps: { color: 'red' },
                      onConfirm: () =>
                        hardDeleteCommentMutation.mutate({
                          commentId: comment.id,
                        }),
                    })
                  }}
                  leftIcon={<AiOutlineDelete />}
                  color="red"
                  size="xs"
                  variant={'subtle'}
                >
                  Hard Delete
                </Button>
              </Group>
            </Stack>
          </Group>
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

export default DeletedCommentsPage