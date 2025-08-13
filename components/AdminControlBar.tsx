import { Button, Group, Text, Checkbox } from '@mantine/core'
import React from 'react'

interface AdminControlBarProps {
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
  canSelectAll?: boolean
  showAdminFilter?: boolean
  hideAdminPosts?: boolean
  onToggleAdminFilter?: (checked: boolean) => void
  globalCount?: number
  currentPage?: number
  totalPages?: number
}

export function AdminControlBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  buttons,
  canSelectAll = true,
  showAdminFilter = false,
  hideAdminPosts = false,
  onToggleAdminFilter,
  globalCount,
  currentPage,
  totalPages,
}: AdminControlBarProps) {
  return (
    <Group position="apart">
      <Group spacing={8}>
        {buttons.map((button, index) => (
          <Button
            key={index}
            size="xs"
            color={button.color}
            variant={button.variant}
            loading={button.loading}
            disabled={button.disabled}
            onClick={button.onClick}
          >
            {button.label}
          </Button>
        ))}
        {canSelectAll && (
          <Button
            size="xs"
            variant="subtle"
            onClick={onSelectAll}
            disabled={totalCount === 0}
          >
            Select All on Page
          </Button>
        )}
        <Button
          size="xs"
          variant="subtle"
          onClick={onClearSelection}
          disabled={selectedCount === 0}
        >
          Clear Selection
        </Button>
      </Group>
      <Group spacing={12}>
        {showAdminFilter && (
          <Checkbox
            size="xs"
            label="Hide admin posts"
            checked={hideAdminPosts}
            onChange={(event) => onToggleAdminFilter?.(event.currentTarget.checked)}
          />
        )}
        <Text size="xs" color="dimmed">
          {totalCount} items on this page
          {globalCount && totalPages && totalPages > 1 && (
            <>, {globalCount} total across {totalPages} pages</>
          )}
        </Text>
      </Group>
    </Group>
  )
}