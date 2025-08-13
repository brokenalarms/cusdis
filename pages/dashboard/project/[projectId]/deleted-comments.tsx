import { Anchor, Box, Button, Center, Group, List, Pagination, Stack, Text, Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { useMutation, useQuery } from 'react-query'
import { MainLayout } from '../../../../components/Layout'
import { AdminControlBar } from '../../../../components/AdminControlBar'
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
  const isSelected = React.useCallback((id: string) => selectedCommentIds.includes(id), [selectedCommentIds])
  const toggleSelected = (id: string) => {
    setSelectedCommentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const selectAllOnPage = () => {
    const ids = getDeletedCommentsQuery.data?.data?.map((c) => c.id) || []
    setSelectedCommentIds(ids)
  }
  const clearSelection = () => setSelectedCommentIds([])

  // Batch hard delete handler
  const [isBatchHardDeleting, setIsBatchHardDeleting] = React.useState(false)
  const handleBatchHardDelete = async () => {
    if (selectedCommentIds.length === 0) return
    setIsBatchHardDeleting(true)
    try {
      const result = await hardDeleteComments({ commentIds: selectedCommentIds })
      notifications.show({
        title: 'Permanently Deleted',
        message: `Permanently deleted ${result.deletedCount} comment(s) and replies`,
        color: 'red'
      })
      setSelectedCommentIds([])
      await getDeletedCommentsQuery.refetch()
    } catch (e) {
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
    try {
      const result = await restoreComments({ commentIds: selectedCommentIds })
      notifications.show({
        title: 'Restored',
        message: `Restored ${result.restored} comment(s)`,
        color: 'green'
      })
      setSelectedCommentIds([])
      await getDeletedCommentsQuery.refetch()
    } catch (e) {
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
    <>
      <MainLayout id="deleted-comments" project={props.project} {...props.mainLayoutData} isLoading={getDeletedCommentsQuery.isFetching}>
        <Stack>
          <AdminControlBar
            selectedCount={selectedCommentIds.length}
            totalCount={getDeletedCommentsQuery.data?.data?.length || 0}
            onSelectAll={selectAllOnPage}
            onClearSelection={clearSelection}
            buttons={controlBarButtons}
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
            }
          }}>
            {getDeletedCommentsQuery.data?.data.map(comment => {
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
                            fontWeight: 500,
                            color: 'red'
                          }}>
                            [DELETED] {comment.by_nickname}
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
                          <Text sx={{}}>
                            {comment.parsedCreatedAt}
                          </Text>
                          <Text>
                            on
                          </Text>
                          <Anchor href={comment.page.url} target="_blank">{comment.page.slug}</Anchor>
                        </Group>
                        <Box sx={{
                          marginTop: 8,
                          padding: 8,
                          backgroundColor: '#f8f8f8',
                          borderLeft: '4px solid #red',
                          fontStyle: 'italic'
                        }}>
                          {comment.content}
                        </Box>
                        {comment.replies.commentCount > 0 && (
                          <Text size="xs" color="dimmed" sx={{ marginTop: 8 }}>
                            {comment.replies.commentCount} repl{comment.replies.commentCount === 1 ? 'y' : 'ies'} (will be affected by restore/delete)
                          </Text>
                        )}
                      </Stack>
                    </Stack>
                  </Group>
                </List.Item>
              )
            })}
          </List>
          {getDeletedCommentsQuery.data?.data.length === 0 && (
            <Box p={'xl'} sx={{
              backgroundColor: '#fff'
            }}>
              <Center>
                <Text color="gray" size="sm">
                  No deleted comments
                </Text>
              </Center>
            </Box>
          )}
          <Box>
            <Pagination total={getDeletedCommentsQuery.data?.pageCount || 0} value={page} onChange={count => {
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