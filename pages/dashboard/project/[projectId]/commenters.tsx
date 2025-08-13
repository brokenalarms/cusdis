import { Anchor, Box, Button, Center, Group, List, Pagination, Stack, Text, Checkbox, Loader, Overlay } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { useMutation, useQuery } from 'react-query'
import { MainLayout } from '../../../../components/Layout'
import { AdminControlBar } from '../../../../components/AdminControlBar'
import { UserSession } from '../../../../service'
import { CommentItem } from '../../../../service/comment.service'
import { ProjectService } from '../../../../service/project.service'
import { MainLayoutData, ViewDataService } from '../../../../service/viewData.service'
import { apiClient } from '../../../../utils.client'
import { getSession } from '../../../../utils.server'

type CommenterGroup = {
  email: string
  nickname: string
  commentCount: number
  comments: CommentItem[]
  isAdmin: boolean
}

type CommentersData = {
  data: CommenterGroup[]
  total: number
  page: number
  pageCount: number
}

const getCommenters = async ({ queryKey }) => {
  const [_key, { projectId, page }] = queryKey
  const res = await apiClient.get<{
    data: CommentersData,
  }>(`/project/${projectId}/commenters`, {
    params: {
      page,
    }
  })
  return res.data.data
}

const batchDeleteCommentsByEmail = async ({ projectId, emails }) => {
  const res = await apiClient.delete(`/project/${projectId}/commenters/batch-delete`, {
    data: { emails }
  })
  return res.data
}

function CommentersPage(props: {
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

  const getCommentersQuery = useQuery(['getCommenters', { projectId: router.query.projectId as string, page }], getCommenters, {
  })

  // Selection state for batch actions
  const [selectedEmails, setSelectedEmails] = React.useState<string[]>([])
  const isSelected = React.useCallback((email: string) => selectedEmails.includes(email), [selectedEmails])
  const toggleSelected = (email: string) => {
    setSelectedEmails(prev => prev.includes(email) ? prev.filter(x => x !== email) : [...prev, email])
  }

  // Admin filter state
  const [hideAdminPosts, setHideAdminPosts] = React.useState(false)
  
  const clearSelection = () => setSelectedEmails([])

  // Batch delete by email handler
  const [isBatchDeleting, setIsBatchDeleting] = React.useState(false)
  const handleBatchDeleteByEmail = async () => {
    if (selectedEmails.length === 0) return
    const totalComments = getCommentersQuery.data?.data
      ?.filter(c => selectedEmails.includes(c.email))
      ?.reduce((sum, c) => sum + c.commentCount, 0) || 0
    
    if (!window.confirm(`Delete all comments from ${selectedEmails.length} selected commenter(s)? This will delete ${totalComments} comment(s) total and cannot be undone.`)) return
    
    setIsBatchDeleting(true)
    try {
      const result = await batchDeleteCommentsByEmail({ 
        projectId: router.query.projectId as string, 
        emails: selectedEmails 
      })
      notifications.show({
        title: 'Deleted',
        message: `Deleted all comments from ${selectedEmails.length} commenter(s)`,
        color: 'red'
      })
      setSelectedEmails([])
      await getCommentersQuery.refetch()
    } catch (e) {
      notifications.show({ title: 'Error', message: 'Delete operation failed', color: 'red' })
    } finally {
      setIsBatchDeleting(false)
    }
  }

  // Control bar buttons configuration
  const controlBarButtons = [
    {
      label: `Delete All Comments from Selected (${selectedEmails.length})`,
      color: 'red',
      variant: 'light',
      loading: isBatchDeleting,
      disabled: selectedEmails.length === 0,
      onClick: handleBatchDeleteByEmail,
    },
  ]

  // Apply admin filtering
  const allCommenters = getCommentersQuery.data?.data || []
  const filteredCommenters = hideAdminPosts 
    ? allCommenters.filter(commenter => !commenter.isAdmin)
    : allCommenters

  const selectAllOnPage = () => {
    const emails = filteredCommenters.map((c) => c.email)
    setSelectedEmails(emails)
  }

  return (
    <>
      <MainLayout id="commenters" project={props.project} {...props.mainLayoutData} isLoading={getCommentersQuery.isFetching}>
        <Stack>
          <AdminControlBar
            selectedCount={selectedEmails.length}
            totalCount={filteredCommenters.length}
            onSelectAll={selectAllOnPage}
            onClearSelection={clearSelection}
            buttons={controlBarButtons}
            showAdminFilter={true}
            hideAdminPosts={hideAdminPosts}
            onToggleAdminFilter={setHideAdminPosts}
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
            {filteredCommenters.map(commenter => {
              return (
                <List.Item key={commenter.email}>
                  <Group align="flex-start" spacing={12}>
                    <Checkbox aria-label="Select commenter" checked={isSelected(commenter.email)} onChange={() => toggleSelected(commenter.email)} />
                    <Stack sx={{ flex: 1 }}>
                      <Group spacing={8} sx={{
                        fontSize: 14
                      }}>
                        <Text sx={{
                          fontWeight: 500
                        }}>
                          {commenter.nickname}
                        </Text>
                        <Text sx={{
                          fontWeight: 400,
                          color: 'gray'
                        }}>
                          {commenter.email}
                        </Text>
                        <Text sx={{
                          fontSize: 12,
                          color: 'dimmed'
                        }}>
                          ({commenter.commentCount} comment{commenter.commentCount !== 1 ? 's' : ''})
                        </Text>
                      </Group>
                      
                      {/* Show recent comments */}
                      <Stack spacing={8} sx={{ marginLeft: 16 }}>
                        {commenter.comments.slice(0, 3).map(comment => (
                          <Box key={comment.id} sx={{ 
                            padding: 8, 
                            backgroundColor: '#f8f9fa', 
                            borderRadius: 4,
                            fontSize: 12
                          }}>
                            <Group spacing={4}>
                              <Text sx={{ fontWeight: 500 }}>
                                {comment.parsedCreatedAt}
                              </Text>
                              <Text>on</Text>
                              <Anchor href={comment.page.url} target="_blank" size="sm">{comment.page.slug}</Anchor>
                            </Group>
                            <Text sx={{ marginTop: 4 }}>
                              {comment.content.length > 100 ? comment.content.substring(0, 100) + '...' : comment.content}
                            </Text>
                          </Box>
                        ))}
                        {commenter.commentCount > 3 && (
                          <Text size="xs" color="dimmed">
                            ... and {commenter.commentCount - 3} more comment{commenter.commentCount - 3 !== 1 ? 's' : ''}
                          </Text>
                        )}
                      </Stack>
                    </Stack>
                  </Group>
                </List.Item>
              )
            })}
          </List>
          {getCommentersQuery.data?.data.length === 0 && (
            <Box p={'xl'} sx={{
              backgroundColor: '#fff'
            }}>
              <Center>
                <Text color="gray" size="sm">
                  No commenters yet
                </Text>
              </Center>
            </Box>
          )}
          <Box>
            <Pagination total={getCommentersQuery.data?.pageCount || 0} value={page} onChange={count => {
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

export default CommentersPage