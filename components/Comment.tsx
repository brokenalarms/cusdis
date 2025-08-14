import { Anchor, Box, Checkbox, Group, Stack, Text } from '@mantine/core'
import React from 'react'
import { isAdmin } from '../utils/adminHelpers'
import { MODFlag } from './MODFlag'
import { NewBadge } from './NewBadge'
import { CommentItem } from '../service/comment.service'

interface CommentProps {
  comment: CommentItem
  showCheckbox?: boolean
  isSelected?: boolean
  onToggleSelected?: () => void
  actions?: React.ReactNode
}

export const Comment: React.FC<CommentProps> = ({
  comment,
  showCheckbox = false,
  isSelected = false,
  onToggleSelected,
  actions
}) => {
  const isDeleted = Boolean(comment.deletedAt)

  return (
    <Group align="flex-start" spacing={12}>
      {showCheckbox && (
        <Checkbox
          aria-label="Select comment"
          checked={isSelected}
          onChange={onToggleSelected}
        />
      )}
      <Stack>
        <Stack spacing={4}>
          <Group spacing={8} sx={{ fontSize: 14 }}>
            <Text sx={{
              fontWeight: 500,
              color: isDeleted ? 'red' : undefined
            }}>
              {isDeleted && '[DELETED] '}{comment.by_nickname}
            </Text>
            {isAdmin(comment) && <MODFlag />}
            {comment._isWebSocketUpdate && <NewBadge action={comment._webSocketAction} />}
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
          
          <Group spacing={8} sx={{ fontSize: 12 }}>
            <Text>{comment.parsedCreatedAt}</Text>
            <Text>on</Text>
            <Anchor href={comment.page.url} target="_blank">{comment.page.slug}</Anchor>
          </Group>
          
          <Box sx={{
            marginTop: 8,
            padding: isDeleted ? 8 : 0,
            backgroundColor: isDeleted ? '#f8f8f8' : 'transparent',
            borderLeft: isDeleted ? '4px solid red' : 'none',
            fontStyle: isDeleted ? 'italic' : 'normal'
          }}>
            {comment.content}
          </Box>
          
          {comment.replies.commentCount > 0 && (
            <Text size="xs" color="dimmed" sx={{ marginTop: 8 }}>
              {comment.replies.commentCount} repl{comment.replies.commentCount === 1 ? 'y' : 'ies'}
              {isDeleted && ' (will be affected by restore/delete)'}
            </Text>
          )}
        </Stack>
        
        {actions && (
          <Group sx={{ alignSelf: 'flex-start' }}>
            {actions}
          </Group>
        )}
      </Stack>
    </Group>
  )
}