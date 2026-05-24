export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchResponse<T> extends PaginatedResponse<T> {
  scope: string;
}
