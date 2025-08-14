import { Badge } from '@mantine/core'
import React from 'react'

interface NewBadgeProps {
  action?: 'created' | 'updated' | 'deleted' | 'restored'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export const NewBadge: React.FC<NewBadgeProps> = ({ action = 'created', size = 'xs' }) => {
  const badgeConfig = {
    created: { label: 'NEW', color: 'blue' },
    updated: { label: 'UPD', color: 'yellow' },
    restored: { label: 'RST', color: 'green' },
    deleted: { label: 'DEL', color: 'red' }
  }

  const { label, color } = badgeConfig[action]

  return (
    <Badge 
      size={size}
      color={color}
      variant="filled"
      sx={{
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        animation: 'pulse 2s infinite'
      }}
      styles={{
        root: {
          '@keyframes pulse': {
            '0%': { opacity: 1 },
            '50%': { opacity: 0.7 },
            '100%': { opacity: 1 }
          }
        }
      }}
    >
      {label}
    </Badge>
  )
}