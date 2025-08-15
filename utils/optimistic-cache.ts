import { useMutation, useQueryClient, QueryClient } from 'react-query'

// Generic type for paginated data structures
interface PaginatedData {
  data: Array<{ id?: string; email?: string }>
  commentCount?: number
  total?: number
  pageCount?: number
}

// Helper function to collect all cached items from paginated queries
async function collectAllCachedItems(
  queryClient: QueryClient,
  baseQueryKey: unknown[],
  currentPage: number,
  fetchFunction?: ({ queryKey }: { queryKey: unknown[] }) => Promise<PaginatedData>
): Promise<{ allItems: any[]; totalCount: number; maxLoadedPage: number; needsMoreData: boolean }> {
  const allItems: any[] = []
  let totalCount = 0
  let maxLoadedPage = 0
  let needsMoreData = false
  
  
  // Try to collect from multiple pages (reasonable limit to prevent infinite loop)
  for (let page = 1; page <= 20; page++) {
    const baseParams = baseQueryKey[1] as any
    const pageQueryKey = [baseQueryKey[0], { ...baseParams, page }]
    let cachedData = queryClient.getQueryData<PaginatedData>(pageQueryKey)
    
    // If no cached data and we have a fetch function, try fetching the next logical page
    if (!cachedData && fetchFunction && page === currentPage + 1 && allItems.length === 0) {
      try {
        cachedData = await queryClient.fetchQuery(pageQueryKey, fetchFunction)
        needsMoreData = true
      } catch (error) {
        break
      }
    }
    
    
    if (cachedData && cachedData.data.length > 0) {
      allItems.push(...cachedData.data)
      totalCount = cachedData.commentCount || cachedData.total || 0
      maxLoadedPage = Math.max(maxLoadedPage, page)
    } else if (page > currentPage) {
      // Stop looking if we don't find data beyond current page
      break
    }
  }
  
  return { allItems, totalCount, maxLoadedPage, needsMoreData }
}

// Helper function to redistribute items across page caches
function redistributeItemsAcrossPages(
  queryClient: QueryClient,
  baseQueryKey: unknown[],
  allItems: any[],
  pageSize: number,
  maxPagesToUpdate: number
) {
  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize))
  
  
  // Update each page cache with correct items
  for (let page = 1; page <= Math.min(maxPagesToUpdate, totalPages); page++) {
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const pageItems = allItems.slice(startIndex, endIndex)
    
    const baseParams = baseQueryKey[1] as any
    const pageQueryKey = [baseQueryKey[0], { ...baseParams, page }]
    
    
    queryClient.setQueryData<PaginatedData>(pageQueryKey, (old) => {
      if (!old) return old
      
      return {
        ...old,
        data: pageItems,
        commentCount: allItems.length,
        total: allItems.length,
        pageCount: totalPages
      }
    })
  }
  
  // Remove caches for pages that no longer exist
  for (let page = totalPages + 1; page <= maxPagesToUpdate; page++) {
    const baseParams = baseQueryKey[1] as any
    const pageQueryKey = [baseQueryKey[0], { ...baseParams, page }]
    queryClient.removeQueries(pageQueryKey)
  }
}

// Helper function to extract current page from query key
function getCurrentPageFromKey(queryKey: unknown[]): number {
  if (queryKey.length >= 2 && typeof queryKey[1] === 'object' && queryKey[1] !== null) {
    const params = queryKey[1] as any
    return params.page || 1
  }
  return 1
}

/**
 * Creates an optimistic mutation configuration for removing items from paginated lists
 * 
 * @param apiCall - The API function to call
 * @param currentPageQueryKey - Query key for the current page cache
 * @param projectQueryKey - Query key pattern for all project queries (for invalidation)
 * @param extractItemIds - Function to extract item IDs from mutation variables
 * @param pageSize - Items per page (default: 10)
 */
export function createOptimisticRemovalMutation<TData, TVariables>(
  apiCall: (variables: TVariables) => Promise<TData>,
  currentPageQueryKey: unknown[],
  projectQueryKey: unknown[],
  extractItemIds: (variables: TVariables) => string[],
  pageSize: number = 10
) {
  return {
    mutationFn: apiCall,
    
    onMutate: async (variables: TVariables) => {
      const queryClient = new QueryClient()
      const itemIds = extractItemIds(variables)
      
      // Cancel outgoing queries to prevent race conditions
      await queryClient.cancelQueries(currentPageQueryKey)
      
      // Snapshot the previous value for rollback
      const previousData = queryClient.getQueryData<PaginatedData>(currentPageQueryKey)
      
      // Optimistically update the cache
      queryClient.setQueryData<PaginatedData>(currentPageQueryKey, (old) => {
        if (!old) return old
        
        // Filter out the removed items
        const filteredData = old.data.filter(item => {
          const itemId = item.id || item.email
          return itemId && !itemIds.includes(itemId)
        })
        
        // Calculate new counts
        const removedCount = itemIds.length
        const newTotalCount = Math.max(0, (old.commentCount || old.total || 0) - removedCount)
        const newPageCount = Math.max(1, Math.ceil(newTotalCount / pageSize))
        
        return {
          ...old,
          data: filteredData,
          // Support both commentCount (comments) and total (commenters) 
          ...(old.commentCount !== undefined && { commentCount: newTotalCount }),
          ...(old.total !== undefined && { total: newTotalCount }),
          pageCount: newPageCount
        }
      })
      
      return { previousData, queryKey: currentPageQueryKey }
    },
    
    onSuccess: () => {
      // Invalidate all queries for this project to ensure consistency
      const queryClient = new QueryClient()
      queryClient.invalidateQueries(projectQueryKey)
    },
    
    onError: (error: any, variables: TVariables, context: any) => {
      // Rollback the optimistic update on error
      if (context?.previousData && context?.queryKey) {
        const queryClient = new QueryClient()
        queryClient.setQueryData(context.queryKey, context.previousData)
      }
    }
  }
}

/**
 * Hook that creates an optimistic removal mutation for paginated data
 * 
 * @param apiCall - The API function to call
 * @param currentPageQueryKey - Query key for the current page cache  
 * @param projectQueryKey - Query key pattern for all project queries
 * @param extractItemIds - Function to extract item IDs from mutation variables
 * @param pageSize - Items per page (default: 10)
 */
export function useOptimisticRemovalMutation<TData, TVariables>(
  apiCall: (variables: TVariables) => Promise<TData>,
  currentPageQueryKey: unknown[],
  projectQueryKey: unknown[],
  extractItemIds: (variables: TVariables) => string[],
  pageSize: number = 10
) {
  const queryClient = useQueryClient()
  
  return useMutation(apiCall, {
    
    onMutate: async (variables: TVariables) => {
      const itemIds = extractItemIds(variables)
      
      // Cancel outgoing queries to prevent race conditions
      await queryClient.cancelQueries(projectQueryKey)
      
      // Collect all cached items from all pages
      const { allItems, totalCount, maxLoadedPage } = await collectAllCachedItems(
        queryClient, 
        projectQueryKey, 
        getCurrentPageFromKey(currentPageQueryKey)
      )
      
      // Snapshot for rollback
      const previousCacheSnapshots = new Map()
      for (let page = 1; page <= maxLoadedPage; page++) {
        const baseParams = projectQueryKey[1] as any
        const pageKey = [projectQueryKey[0], { ...baseParams, page }]
        previousCacheSnapshots.set(page, queryClient.getQueryData(pageKey))
      }
      
      // Remove deleted items from all cached items
      const remainingItems = allItems.filter(item => {
        const itemId = item.id || item.email
        return itemId && !itemIds.includes(itemId)
      })
      
      // Redistribute items across page caches
      redistributeItemsAcrossPages(
        queryClient,
        projectQueryKey,
        remainingItems,
        pageSize,
        maxLoadedPage
      )
      
      return { 
        previousCacheSnapshots, 
        maxLoadedPage,
        projectQueryKey: projectQueryKey
      }
    },
    
    onSuccess: async () => {
      // Only invalidate if we might need more data (i.e., if we have fewer items than expected)
      // This reduces unnecessary refetches while ensuring we get more data when needed
      const { allItems } = await collectAllCachedItems(
        queryClient, 
        projectQueryKey, 
        getCurrentPageFromKey(currentPageQueryKey)
      )
      
      // If we have very few cached items, invalidate to fetch more
      if (allItems.length < pageSize * 2) {
        queryClient.invalidateQueries(projectQueryKey)
      }
    },
    
    onError: (error, variables, context: any) => {
      // Rollback all affected page caches on error
      if (context?.previousCacheSnapshots && context?.maxLoadedPage) {
        for (let page = 1; page <= context.maxLoadedPage; page++) {
          const baseParams = context.projectQueryKey[1] as any
          const pageKey = [context.projectQueryKey[0], { ...baseParams, page }]
          const previousData = context.previousCacheSnapshots.get(page)
          if (previousData) {
            queryClient.setQueryData(pageKey, previousData)
          }
        }
      }
    }
  })
}

/**
 * Utility functions for common ID extraction patterns
 */
export const idExtractors = {
  singleId: (variables: { commentId: string }) => [variables.commentId],
  multipleIds: (variables: { commentIds: string[] }) => variables.commentIds,
  singleEmail: (variables: { emails: string[] }) => variables.emails,
  multipleEmails: (variables: { emails: string[] }) => variables.emails,
}