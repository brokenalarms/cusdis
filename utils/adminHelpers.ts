import { CommentItem } from '../service/comment.service'

// Type for commenter groups from the commenters API
type CommenterGroup = {
  email: string
  nickname: string
  commentCount: number
  comments: CommentItem[]
  isAdmin: boolean
}

// Unified admin detection utility
export const isAdmin = (item: CommentItem | CommenterGroup): boolean => {
  // For comments: check moderatorId presence
  if ('moderatorId' in item) {
    return Boolean(item.moderatorId)
  }
  // For commenter groups: use the computed isAdmin flag
  return item.isAdmin
}