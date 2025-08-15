import React from 'react'
import { useQueryClient } from 'react-query'
import { useRouter } from 'next/router'

interface PaginatedQueryData {
  pageCount: number
}

/**
 * Hook for proactive page prefetching to improve cache redistribution
 * 
 * @param queryType - The base query key (e.g., 'getComments', 'getDeletedComments', 'getCommenters')
 * @param queryData - The current query data containing pageCount
 * @param currentPage - Current page number
 * @param fetchFunction - The query function to use for prefetching
 */
export function usePagePrefetch<T extends PaginatedQueryData>(
  queryType: string,
  queryData: T | undefined,
  currentPage: number,
  fetchFunction: ({ queryKey }: { queryKey: unknown[] }) => Promise<T>
) {
  const queryClient = useQueryClient()
  const router = useRouter()

  React.useEffect(() => {
    const projectIdStr = router.query.projectId as string
    if (!projectIdStr || !queryData) return

    const { pageCount } = queryData
    
    // Prefetch next page for better redistribution when deleting items
    if (pageCount > currentPage) {
      const nextPageKey = [queryType, { projectId: projectIdStr, page: currentPage + 1 }]
      queryClient.prefetchQuery(nextPageKey, fetchFunction)
    }
    
    // Also prefetch previous page if we're not on page 1
    if (currentPage > 1) {
      const prevPageKey = [queryType, { projectId: projectIdStr, page: currentPage - 1 }]
      queryClient.prefetchQuery(prevPageKey, fetchFunction)
    }
  }, [queryData?.pageCount, currentPage, router.query.projectId, queryClient, queryType, fetchFunction])
}