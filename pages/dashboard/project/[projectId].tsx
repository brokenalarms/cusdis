import { Anchor, Box, Button, Center, Group, List, Pagination, Stack, Text, Textarea, Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { AiOutlineCheck, AiOutlineSmile } from 'react-icons/ai'
import { useMutation, useQuery } from 'react-query'
import { MainLayout } from '../../../components/Layout'
import { UserSession } from '../../../service'
import { CommentItem, CommentWrapper } from '../../../service/comment.service'
import { ProjectService } from '../../../service/project.service'
import { MainLayoutData, ViewDataService } from '../../../service/viewData.service'
import { apiClient } from '../../../utils.client'
import { getSession } from '../../../utils.server'

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

const approveComment = async ({ commentId }) => {
  const res = await apiClient.post(`/comment/${commentId}/approve`)
  return res.data
}

const deleteComment = async ({ commentId }) => {
  const res = await apiClient.delete(`/comment/${commentId}`)
  return res.data
}

const batchDeleteComments = async ({ commentIds }) => {
  const res = await apiClient.delete('/comments/batch-delete', {
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
}) {

  const [replyContent, setReplyContent] = React.useState("")
  const [isOpenReplyForm, setIsOpenReplyForm] = React.useState(false)

  const approveCommentMutation = useMutation(approveComment, {
    onSuccess() {
      props.refetch()
    },
    onError(data: any) {
      const {
        error: message,
        status: statusCode
      } = data.response.data

      notifications.show({
        title: "Error",
        message,
        color: 'yellow'
      })
    }
  })
  const replyCommentMutation = useMutation(replyAsModerator, {
    onSuccess() {
      setIsOpenReplyForm(false)
      props.refetch()
    }
  })
  const deleteCommentMutation = useMutation(deleteComment, {
    onSuccess() {
      props.refetch()
    }
  })

  return (
    <Stack>
      <Group spacing={4}>
        {props.comment.approved ? (
          <Button leftIcon={<AiOutlineCheck />} color="green" size="xs" variant={'light'}>
            Approved
          </Button>
        ) : (
          <Button loading={approveCommentMutation.isLoading} onClick={_ => {
            // if (window.confirm("Are you sure you want to approve this comment?")) {
              approveCommentMutation.mutate({
                commentId: props.comment.id
              })
            // }
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

  const getCommentsQuery = useQuery(['getComments', { projectId: router.query.projectId as string, page }], getComments, {
  })

  // Selection state for batch actions
  const [selectedCommentIds, setSelectedCommentIds] = React.useState<string[]>([])
  const isSelected = React.useCallback((id: string) => selectedCommentIds.includes(id), [selectedCommentIds])
  const toggleSelected = (id: string) => {
    setSelectedCommentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const selectAllOnPage = () => {
    const ids = getCommentsQuery.data?.data?.map((c) => c.id) || []
    setSelectedCommentIds(ids)
  }
  const clearSelection = () => setSelectedCommentIds([])

  // Batch approve handler uses existing approveComment()
  const [isBatchApproving, setIsBatchApproving] = React.useState(false)
  const handleBatchApprove = async () => {
    if (selectedCommentIds.length === 0) return
    setIsBatchApproving(true)
    try {
      await Promise.all(selectedCommentIds.map((id) => approveComment({ commentId: id })))
      notifications.show({ title: 'Approved', message: `Approved ${selectedCommentIds.length} comment(s)`, color: 'green' })
      setSelectedCommentIds([])
      await getCommentsQuery.refetch()
    } catch (e) {
      notifications.show({ title: 'Error', message: 'Some approvals may have failed', color: 'red' })
    } finally {
      setIsBatchApproving(false)
    }
  }

  // Batch delete handler uses new batch API
  const [isBatchDeleting, setIsBatchDeleting] = React.useState(false)
  const handleBatchDelete = async () => {
    if (selectedCommentIds.length === 0) return
    if (!window.confirm(`Delete ${selectedCommentIds.length} selected comment(s)? This cannot be undone.`)) return
    setIsBatchDeleting(true)
    try {
      const result = await batchDeleteComments({ commentIds: selectedCommentIds })
      const { deleted, requested } = result
      const failed = requested - deleted
      notifications.show({
        title: failed ? 'Partially deleted' : 'Deleted',
        message: failed ? `Deleted ${deleted}, failed ${failed}` : `Deleted ${deleted} comment(s)`,
        color: failed ? 'yellow' : 'red'
      })
      setSelectedCommentIds([])
      await getCommentsQuery.refetch()
    } catch (e) {
      notifications.show({ title: 'Error', message: 'Delete operation failed', color: 'red' })
    } finally {
      setIsBatchDeleting(false)
    }
  }

  const { commentCount = 0, pageCount = 0 } = getCommentsQuery.data || {}

  return (
    <>
      <MainLayout id="comments" project={props.project} {...props.mainLayoutData}>
        <Stack>
          <Group position="apart">
            <Group spacing={8}>
              <Button size="xs" color="green" onClick={handleBatchApprove} loading={isBatchApproving} disabled={selectedCommentIds.length === 0}>
                Approve Selected ({selectedCommentIds.length})
              </Button>
              <Button size="xs" color="red" variant="light" onClick={handleBatchDelete} loading={isBatchDeleting} disabled={selectedCommentIds.length === 0}>
                Delete Selected
              </Button>
              <Button size="xs" variant="subtle" onClick={selectAllOnPage} disabled={!getCommentsQuery.data?.data?.length}>
                Select All on Page
              </Button>
              <Button size="xs" variant="subtle" onClick={clearSelection} disabled={selectedCommentIds.length === 0}>
                Clear Selection
              </Button>
            </Group>
            <Text size="xs" color="dimmed">{getCommentsQuery.data?.data?.length || 0} items on this page</Text>
          </Group>
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
            {getCommentsQuery.data?.data.map(comment => {
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
                    </Stack>
                    <Group sx={{
                    }}>
                      <CommentToolbar comment={comment} refetch={getCommentsQuery.refetch} />
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
