import { Button, List, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { useAdminFilter } from '../../../../hooks/useAdminFilter'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { AiOutlineReload, AiOutlineDelete } from 'react-icons/ai'
import { useQuery } from 'react-query'
import { AdminPageLayout } from '../../../../components/AdminPageLayout'
import { Comment } from '../../../../components/Comment'
import { UserSession } from '../../../../service'
import { CommentItem, CommentWrapper } from '../../../../service/comment.service'
import { ProjectService } from '../../../../service/project.service'
import { MainLayoutData, ViewDataService } from '../../../../service/viewData.service'
import { apiClient } from '../../../../utils.client'
import { getSession } from '../../../../utils.server'
import { useOptimisticRemovalMutation, idExtractors } from '../../../../utils/optimistic-cache'
import { usePagePrefetch } from '../../../../utils/use-page-prefetch'

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

  const queryKey = ['getDeletedComments', { projectId: router.query.projectId as string, page }]
  const getDeletedCommentsQuery = useQuery(queryKey, getDeletedComments)

  // Proactive page prefetching for better cache redistribution
  usePagePrefetch('getDeletedComments', getDeletedCommentsQuery.data, page, getDeletedComments)

  // Selection state for batch actions
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<string[]>([])
  
  // Admin filtering using reusable hook
  const allComments = getDeletedCommentsQuery.data?.data || []
  const { hideAdminPosts, setHideAdminPosts, filteredItems: filteredComments } = useAdminFilter(allComments)
  
  // Individual action mutations using optimistic updates
  const restoreCommentMutation = useOptimisticRemovalMutation(
    (data: { commentId: string }) => restoreComments({ commentIds: [data.commentId] }),
    ['getDeletedComments', { projectId: router.query.projectId as string, page }],
    ['getDeletedComments', { projectId: router.query.projectId as string }],
    idExtractors.singleId
  )

  const hardDeleteCommentMutation = useOptimisticRemovalMutation(
    (data: { commentId: string }) => hardDeleteComments({ commentIds: [data.commentId] }),
    ['getDeletedComments', { projectId: router.query.projectId as string, page }],
    ['getDeletedComments', { projectId: router.query.projectId as string }],
    idExtractors.singleId
  )
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

  // Batch hard delete using optimistic mutation
  const batchHardDeleteMutation = useOptimisticRemovalMutation(
    (data: { commentIds: string[] }) => hardDeleteComments(data),
    ['getDeletedComments', { projectId: router.query.projectId as string, page }],
    ['getDeletedComments', { projectId: router.query.projectId as string }],
    idExtractors.multipleIds
  )

  const performBatchHardDelete = async () => {
    batchHardDeleteMutation.mutate(
      { commentIds: selectedCommentIds },
      {
        onSuccess: (result) => {
          notifications.show({
            title: 'Permanently Deleted',
            message: `Permanently deleted ${result.deletedCount} comment(s) and replies`,
            color: 'red'
          })
          setSelectedCommentIds([])
        },
        onError: () => {
          notifications.show({ 
            title: 'Error', 
            message: 'Hard delete operation failed', 
            color: 'red' 
          })
        }
      }
    )
  }

  // Batch restore using optimistic mutation
  const batchRestoreMutation = useOptimisticRemovalMutation(
    (data: { commentIds: string[] }) => restoreComments(data),
    ['getDeletedComments', { projectId: router.query.projectId as string, page }],
    ['getDeletedComments', { projectId: router.query.projectId as string }],
    idExtractors.multipleIds
  )

  const handleBatchRestore = async () => {
    if (selectedCommentIds.length === 0) return
    
    batchRestoreMutation.mutate(
      { commentIds: selectedCommentIds },
      {
        onSuccess: (result) => {
          notifications.show({
            title: 'Restored',
            message: `Restored ${result.restored} comment(s)`,
            color: 'green'
          })
          setSelectedCommentIds([])
        },
        onError: () => {
          notifications.show({ 
            title: 'Error', 
            message: 'Restore operation failed', 
            color: 'red' 
          })
        }
      }
    )
  }

  const controlBarButtons = [
    {
      label: `Restore Selected (${selectedCommentIds.length})`,
      color: 'green',
      loading: batchRestoreMutation.isLoading,
      disabled: selectedCommentIds.length === 0,
      onClick: handleBatchRestore,
    },
    {
      label: `Hard Delete Selected (${selectedCommentIds.length})`,
      color: 'red',
      variant: 'light',
      loading: batchHardDeleteMutation.isLoading,
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
          <Comment
            comment={comment}
            showCheckbox={true}
            isSelected={isSelected(comment.id)}
            onToggleSelected={() => toggleSelected(comment.id)}
            actions={
              <>
                <Button
                  loading={
                    restoreCommentMutation.isLoading &&
                    restoreCommentMutation.variables?.commentId === comment.id
                  }
                  onClick={() =>
                    restoreCommentMutation.mutate(
                      { commentId: comment.id },
                      {
                        onSuccess: () => {
                          notifications.show({
                            title: 'Restored',
                            message: 'Comment restored successfully',
                            color: 'green'
                          })
                        },
                        onError: () => {
                          notifications.show({
                            title: "Error",
                            message: 'Failed to restore comment',
                            color: 'red'
                          })
                        }
                      }
                    )
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
                    hardDeleteCommentMutation.variables?.commentId === comment.id
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
                        hardDeleteCommentMutation.mutate(
                          { commentId: comment.id },
                          {
                            onSuccess: (result) => {
                              notifications.show({
                                title: 'Permanently Deleted',
                                message: `Permanently deleted comment and ${result.deletedCount - 1} replies`,
                                color: 'red'
                              })
                            },
                            onError: () => {
                              notifications.show({
                                title: "Error",
                                message: 'Failed to permanently delete comment',
                                color: 'red'
                              })
                            }
                          }
                        ),
                    })
                  }}
                  leftIcon={<AiOutlineDelete />}
                  color="red"
                  size="xs"
                  variant={'subtle'}
                >
                  Hard Delete
                </Button>
              </>
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

export default DeletedCommentsPage