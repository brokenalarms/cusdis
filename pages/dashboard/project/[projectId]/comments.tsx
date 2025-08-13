import { Anchor, Box, Button, Center, Group, List, Pagination, Stack, Text, Textarea, Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { AiOutlineCheck, AiOutlineSmile } from 'react-icons/ai'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { MainLayout } from '../../../../components/Layout'
import { AdminControlBar } from '../../../../components/AdminControlBar'
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
    onMutate: async ({ commentId }) => {
      // Cancel any outgoing refetches
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      await queryClient.cancelQueries(queryKey)

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)

      // Optimistically update to the new value
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(comment =>
            comment.id === commentId ? { ...comment, approved: true } : comment
          )
        }
      })

      return { previousComments, queryKey }
    },
    onError: (err, { commentId }, context) => {
      // Revert the optimistic update on error
      if (context?.previousComments) {
        queryClient.setQueryData(context.queryKey, context.previousComments)
      }
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
    onMutate: async ({ commentId }) => {
      // Cancel any outgoing refetches
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      await queryClient.cancelQueries(queryKey)

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)

      // Optimistically update to the new value
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(comment =>
            comment.id === commentId ? { ...comment, approved: false } : comment
          )
        }
      })

      return { previousComments, queryKey }
    },
    onError: (err, { commentId }, context) => {
      // Revert the optimistic update on error
      if (context?.previousComments) {
        queryClient.setQueryData(context.queryKey, context.previousComments)
      }
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
    onSuccess() {
      setIsOpenReplyForm(false)
      // Note: Reply creates a new comment, so optimistic update is complex
      // For now, just refetch since this is less common operation
      props.refetch()
    }
  })
  const deleteCommentMutation = useMutation((data: { commentId: string }) => deleteComments({ commentIds: [data.commentId] }), {
    onMutate: async ({ commentId }) => {
      // Cancel any outgoing refetches
      const queryKey = ['getComments', { projectId: router.query.projectId as string, page: props.currentPage }]
      await queryClient.cancelQueries(queryKey)

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)

      // Optimistically remove comment from UI
      queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.filter(comment => comment.id !== commentId),
          commentCount: Math.max(0, old.commentCount - 1)
        }
      })

      return { previousComments, queryKey }
    },
    onError: (err, { commentId }, context) => {
      // Revert the optimistic update on error
      if (context?.previousComments) {
        queryClient.setQueryData(context.queryKey, context.previousComments)
      }
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
            approveCommentMutation.mutate({
              commentId: props.comment.id
            })
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
          }} disabled={replyContent.length === 0} size="xs">Reply and approve</Button>
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

  const getCommentsQuery = useQuery(['getComments', { projectId: router.query.projectId as string, page }], getComments, {
  })

  // Selection state for batch actions
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<string[]>([])
  const isSelected = React.useCallback((id: string) => selectedCommentIds.includes(id), [selectedCommentIds])
  const toggleSelected = (id: string) => {
    setSelectedCommentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Admin filter state
  const [hideAdminPosts, setHideAdminPosts] = React.useState(false)
  
  const clearSelection = () => setSelectedCommentIds([])

  // Batch approve handler  
  const [isBatchApproving, setIsBatchApproving] = React.useState(false)
  const handleBatchApprove = async () => {
    if (selectedCommentIds.length === 0) return
    setIsBatchApproving(true)
    
    // Optimistic update
    const queryKey = ['getComments', { projectId: router.query.projectId as string, page }]
    const previousComments = queryClient.getQueryData<CommentWrapper>(queryKey)
    
    queryClient.setQueryData<CommentWrapper>(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        data: old.data.map(comment =>
          selectedCommentIds.includes(comment.id) ? { ...comment, approved: true } : comment
        )
      }
    })

    try {
      const result = await approveComments({ commentIds: selectedCommentIds })
      notifications.show({ title: 'Approved', message: `Approved ${result.approved} comment(s)`, color: 'green' })
      setSelectedCommentIds([])
    } catch (e) {
      // Revert optimistic update on error
      if (previousComments) {
        queryClient.setQueryData(queryKey, previousComments)
      }
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
    
    // Optimistic update
    const queryKey = ['getComments', { projectId: router.query.projectId as string, page }]
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
      const result = await deleteComments({ commentIds: selectedCommentIds })
      notifications.show({
        title: 'Deleted',
        message: `Deleted ${result.deleted} comment(s)`,
        color: 'red'
      })
      setSelectedCommentIds([])
    } catch (e) {
      // Revert optimistic update on error
      if (previousComments) {
        queryClient.setQueryData(queryKey, previousComments)
      }
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

  // Apply admin filtering
  const allComments = getCommentsQuery.data?.data || []
  const filteredComments = hideAdminPosts 
    ? allComments.filter(comment => !comment.moderatorId)
    : allComments

  const selectAllOnPage = () => {
    const ids = filteredComments.map((c) => c.id)
    setSelectedCommentIds(ids)
  }

  return (
    <>
      <MainLayout id="comments" project={props.project} {...props.mainLayoutData} isLoading={getCommentsQuery.isLoading}>
        <Stack>
          <AdminControlBar
            selectedCount={selectedCommentIds.length}
            totalCount={filteredComments.length}
            onSelectAll={selectAllOnPage}
            onClearSelection={clearSelection}
            buttons={controlBarButtons}
            showAdminFilter={true}
            hideAdminPosts={hideAdminPosts}
            onToggleAdminFilter={setHideAdminPosts}
            globalCount={commentCount}
            currentPage={page}
            totalPages={pageCount}
          />
          <List listStyleType={'none'} styles={{
            root: {
              border: '1px solid #eee'
            },
            item: {
              backgroundColor: '#fff',
              padding: 12,
              ':not(:last-child)': {
                borderBottom: '1px solid #eee',
              }
              // borderBottom: '1px solid #eee',
            }
          }}>
            {filteredComments.map(comment => {
              return (
                <List.Item key={comment.id}>
                  <Group align="flex-start" spacing={12}>
                    <Checkbox aria-label="Select comment" checked={isSelected(comment.id)} onChange={() => toggleSelected(comment.id)} />
                    <Stack>
                    <Stack spacing={4}>
                      <Group spacing={8} sx={{
                        fontSize: 14
                      }}>
                        <Text sx={{
                          fontWeight: 500
                        }}>
                          {comment.by_nickname}
                        </Text>
                        <Text sx={{
                          fontWeight: 400,
                          color: 'gray'
                        }}>
                          {comment.by_email}
                        </Text>
                        {comment.by_email && !comment.isEmailVerified && (
                          <Text sx={{
                            fontWeight: 500,
                            color: 'orange',
                            fontSize: 11
                          }}>
                            UNVERIFIED
                          </Text>
                        )}
                      </Group>
                      <Group spacing={8} sx={{
                        fontSize: 12
                      }}>
                        <Text sx={{
                        }}>
                          {comment.parsedCreatedAt}
                        </Text>
                        <Text>
                          on
                        </Text>
                        <Anchor href={comment.page.url} target="_blank">{comment.page.slug}</Anchor>
                      </Group>
                      <Box sx={{
                        marginTop: 8
                      }}>
                        {comment.content}
                      </Box>
                      {comment.replies.commentCount > 0 && (
                        <Text size="xs" color="dimmed" sx={{ marginTop: 8 }}>
                          {comment.replies.commentCount} repl{comment.replies.commentCount === 1 ? 'y' : 'ies'}
                        </Text>
                      )}
                    </Stack>
                    <Group sx={{
                    }}>
                      <CommentToolbar comment={comment} refetch={getCommentsQuery.refetch} currentPage={page} />
                    </Group>
                    </Stack>
                  </Group>
                </List.Item>
              )
            })}
          </List>
          {getCommentsQuery.data?.data.length === 0 && (
            <Box p={'xl'} sx={{
              backgroundColor: '#fff'
            }}>
              <Center>
                <Text color="gray" size="sm">
                  No comments yet
                </Text>
              </Center>
            </Box>
          )}
          <Box>
            <Pagination total={getCommentsQuery.data?.pageCount || 0} value={page} onChange={count => {
              setPage(count)
            }} />
          </Box>
        </Stack>
      </MainLayout>
    </>
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

  const projects = await projectService.list()

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
