export type DirectoryAdminStatusFilter = 'all' | 'published' | 'draft'
type DirectoryAdminSortColumn = 'title' | 'category' | 'status' | 'modified' | null
export type DirectoryAdminSortDirection = 'asc' | 'desc'
export type DirectoryAdminListSort = 'default' | 'title' | 'modified'

export interface DirectoryAdminCursorListParams {
  cursor: string | null
  limit: number
  search: string
  siteId: string
  sortColumn: DirectoryAdminSortColumn
  sortDirection: DirectoryAdminSortDirection
  status: DirectoryAdminStatusFilter
}

export function buildDirectoryCursorListQuery(params: DirectoryAdminCursorListParams): {
  cursor: string | null
  limit: number
  search: string
  siteId: string
  sortBy: DirectoryAdminListSort
  sortDirection: DirectoryAdminSortDirection
  status: DirectoryAdminStatusFilter
} {
  return {
    siteId: params.siteId,
    search: params.search,
    status: params.status,
    sortBy: params.sortColumn === 'title'
      ? 'title'
      : params.sortColumn === 'modified'
        ? 'modified'
        : 'default',
    sortDirection: params.sortDirection,
    cursor: params.cursor,
    limit: params.limit,
  }
}
