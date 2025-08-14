import { Anchor, Box, Button, Checkbox, Group, List, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { Project } from '@prisma/client'
import { signIn } from 'next-auth/client'
import { useRouter } from 'next/router'
import React from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useQuery } from 'react-query'
import { useWebSocketForQuery, updateCommentersList } from '../../../../hooks/useQueryWithWebSocket'
import { AdminPageLayout } from '../../../../components/AdminPageLayout'
import { MODFlag } from '../../../../components/MODFlag'
import { NewBadge } from '../../../../components/NewBadge'
import { useAdminFilter } from '../../../../hooks/useAdminFilter'
import { UserSession } from '../../../../service'
import { CommentItem } from '../../../../service/comment.service'
import { ProjectService } from '../../../../service/project.service'
import { MainLayoutData, ViewDataService } from '../../../../service/viewData.service'
import { apiClient } from '../../../../utils.client'
import { getSession } from '../../../../utils.server'
import { isAdmin } from '../../../../utils/adminHelpers'

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

function CommenterToolbar(props: {
  commenter: CommenterGroup,
  refetch: any,
  currentPage: number,
}) {
  const queryClient = useQueryClient()
  const router = useRouter()

  const deleteCommenterMutation = useMutation(
    (data: { projectId: string, emails: string[] }) => batchDeleteCommentsByEmail(data),
    {
      onSuccess: (result, { emails }) => {
        // Update UI only after API success
        const queryKey = ['getCommenters', { projectId: router.query.projectId as string, page: props.currentPage }]
        queryClient.setQueryData<CommentersData>(queryKey, (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.filter(commenter => !emails.includes(commenter.email)),
            total: Math.max(0, old.total - emails.length)
          }
        })
        notifications.show({
          title: 'Deleted',
          message: `Deleted all comments from ${emails.length} commenter(s)`,
          color: 'red'
        })
      },
      onError: (err, { emails }, context) => {
        // Refetch to ensure consistency after error
        props.refetch()
        notifications.show({ 
          title: 'Error', 
          message: 'Delete operation failed', 
          color: 'red' 
        })
      }
    }
  )

  return (
    <Group sx={{ alignSelf: 'flex-start', marginTop: 8 }}>
      <Button 
        loading={deleteCommenterMutation.isLoading} 
        onClick={() => {
          modals.openConfirmModal({
            title: 'Delete all comments from user',
            children: (
              <Stack spacing="xs">
                <Text size="sm">
                  Delete all comments from <strong>{props.commenter.nickname}</strong> ({props.commenter.email})?
                </Text>
                <Text size="sm" color="red">
                  This will soft-delete all {props.commenter.commentCount} comment{props.commenter.commentCount !== 1 ? 's' : ''} from this user.
                </Text>
                <Text size="sm" color="red">
                  Deleted comments can be restored from the deleted comments page.
                </Text>
              </Stack>
            ),
            labels: { confirm: 'Delete All Comments', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: () => deleteCommenterMutation.mutate({ 
              projectId: router.query.projectId as string, 
              emails: [props.commenter.email] 
            })
          })
        }} 
        color="red" 
        size="xs" 
        variant={'light'}
      >
        Delete All Comments
      </Button>
    </Group>
  )
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

  const getCommentersQuery = useQueryWithWebSocket(['getCommenters', { projectId: router.query.projectId as string, page }], getCommenters, updateCommentersList, {
  })

  // Selection state for batch actions
  const [selectedEmails, setSelectedEmails] = React.useState<string[]>([])
  const isSelected = React.useCallback((email: string) => selectedEmails.includes(email), [selectedEmails])
  const toggleSelected = (email: string) => {
    setSelectedEmails(prev => prev.includes(email) ? prev.filter(x => x !== email) : [...prev, email])
  }

  // Admin filtering using reusable hook
  const allCommenters = getCommentersQuery.data?.data || []
  const { hideAdminPosts, setHideAdminPosts, filteredItems: filteredCommenters } = useAdminFilter(allCommenters)
  const clearSelection = () => setSelectedEmails([])

  // Batch delete by email handler
  const queryClient = useQueryClient()
  const batchDeleteMutation = useMutation(
    (data: { projectId: string, emails: string[] }) => batchDeleteCommentsByEmail(data),
    {
      onSuccess: (result, { emails }) => {
        // Update UI only after successful API call
        const queryKey = ['getCommenters', { projectId: router.query.projectId as string, page }]
        queryClient.setQueryData<CommentersData>(queryKey, (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.filter(commenter => !emails.includes(commenter.email)),
            total: Math.max(0, old.total - emails.length)
          }
        })
        
        notifications.show({
          title: 'Deleted',
          message: `Deleted all comments from ${emails.length} commenter(s)`,
          color: 'red'
        })
        setSelectedEmails([])
      },
      onError: (err, { emails }, context) => {
        // Refetch to ensure consistency after error
        getCommentersQuery.refetch()
        notifications.show({ title: 'Error', message: 'Delete operation failed', color: 'red' })
      }
    }
  )

  const handleBatchDeleteByEmail = () => {
    if (selectedEmails.length === 0) return
    
    modals.openConfirmModal({
      title: 'Delete all comments from selected users',
      children: (
        <Stack spacing="xs">
          <Text size="sm">
            Delete all comments from {selectedEmails.length} selected user(s)?
          </Text>
          <Text size="sm" color="red">
            This will soft-delete all comments from: <strong>{selectedEmails.join(', ')}</strong>
          </Text>
          <Text size="sm" color="red">
            Deleted comments can be restored from the deleted comments page.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Delete All Comments', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => batchDeleteMutation.mutate({ 
        projectId: router.query.projectId as string, 
        emails: selectedEmails 
      })
    })
  }

  // Control bar buttons configuration
  const controlBarButtons = [
    {
      label: `Delete All Comments from Selected (${selectedEmails.length})`,
      color: 'red',
      variant: 'light',
      loading: batchDeleteMutation.isLoading,
      disabled: selectedEmails.length === 0,
      onClick: handleBatchDeleteByEmail,
    },
  ]


  const selectAllOnPage = () => {
    const emails = filteredCommenters.map((c) => c.email)
    setSelectedEmails(emails)
  }

  return (
    <AdminPageLayout
      id="commenters"
      project={props.project}
      mainLayoutData={props.mainLayoutData}
      isLoading={getCommentersQuery.isLoading}
      controlBar={{
        selectedCount: selectedEmails.length,
        totalCount: filteredCommenters.length,
        onSelectAll: selectAllOnPage,
        onClearSelection: clearSelection,
        buttons: controlBarButtons,
        showAdminFilter: true,
        hideAdminPosts,
        onToggleAdminFilter: setHideAdminPosts,
        globalCount: getCommentersQuery.data?.total,
        currentPage: page,
        totalPages: getCommentersQuery.data?.pageCount || 0
      }}
      pagination={{
        total: getCommentersQuery.data?.pageCount || 0,
        value: page,
        onChange: setPage
      }}
      emptyState="No commenters yet">
      {filteredCommenters.map(commenter => (
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
                {isAdmin(commenter) && <MODFlag />}
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
              
              <CommenterToolbar 
                commenter={commenter} 
                refetch={getCommentersQuery.refetch} 
                currentPage={page} 
              />
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

export default CommentersPage