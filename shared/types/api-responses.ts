export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: PaginatedMeta;
  error?: string;
  code?: string;
}
