import { Box, List, Pagination, Stack, Text, Center } from '@mantine/core'
import React from 'react'
import { MainLayout } from './Layout'
import { AdminControlBar } from './AdminControlBar'

interface AdminPageLayoutProps {
  id: string
  project: any
  mainLayoutData: any
  isLoading: boolean
  children: React.ReactNode
  controlBar: {
    selectedCount: number
    totalCount: number
    onSelectAll: () => void
    onClearSelection: () => void
    buttons: Array<{
      label: string
      color?: string
      variant?: string
      loading?: boolean
      disabled?: boolean
      onClick: () => void
    }>
    showAdminFilter: boolean
    hideAdminPosts: boolean
    onToggleAdminFilter: (hide: boolean) => void
    globalCount?: number
    currentPage: number
    totalPages: number
  }
  pagination: {
    total: number
    value: number
    onChange: (page: number) => void
  }
  listStyles?: any
  emptyState?: string
}

export const AdminPageLayout: React.FC<AdminPageLayoutProps> = ({
  id,
  project,
  mainLayoutData,
  isLoading,
  children,
  controlBar,
  pagination,
  listStyles,
  emptyState
}) => {
  const defaultListStyles = {
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
  }

  return (
    <MainLayout id={id} project={project} {...mainLayoutData} isLoading={isLoading}>
      <Stack sx={{ height: '100vh', maxHeight: 'calc(100vh - 100px)' }}>
        <AdminControlBar
          selectedCount={controlBar.selectedCount}
          totalCount={controlBar.totalCount}
          onSelectAll={controlBar.onSelectAll}
          onClearSelection={controlBar.onClearSelection}
          buttons={controlBar.buttons}
          showAdminFilter={controlBar.showAdminFilter}
          hideAdminPosts={controlBar.hideAdminPosts}
          onToggleAdminFilter={controlBar.onToggleAdminFilter}
          globalCount={controlBar.globalCount}
          currentPage={controlBar.currentPage}
          totalPages={controlBar.totalPages}
        />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {React.Children.count(children) > 0 ? (
            <List listStyleType={'none'} styles={listStyles || defaultListStyles}>
              {children}
            </List>
          ) : 
          <Center>
            <Text color="gray" size="sm">
              No comments yet
            </Text>
          </Center>
        }
        </Box>
        <Box sx={{ padding: '16px 0' }}>
          <Pagination 
            total={pagination.total} 
            value={pagination.value} 
            onChange={pagination.onChange} 
          />
        </Box>
      </Stack>
    </MainLayout>
  )
}