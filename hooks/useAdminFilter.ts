import { useState } from 'react'
import { isAdmin } from '../utils/adminHelpers'

/**
 * Generic hook for admin filtering functionality
 * Works with any array of items that can be checked with isAdmin()
 */
export const useAdminFilter = <T>(items: T[]) => {
  const [hideAdminPosts, setHideAdminPosts] = useState(false)
  
  const filteredItems = hideAdminPosts 
    ? items.filter(item => !isAdmin(item as any)) // Type assertion needed for generic
    : items
    
  return {
    hideAdminPosts,
    setHideAdminPosts,
    filteredItems
  }
}