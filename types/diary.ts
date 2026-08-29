export interface DiaryEntry {
  date: string;        // YYYY-MM-DD format
  filename: string;    // YYYY-MM-DD_public.md, or YYYY-MM-DD.md for private entries
  content?: string;    // Markdown content (loaded on demand)
  exists: boolean;     // Whether the file exists
}

export interface DiaryListResponse {
  diaries: DiaryEntry[];
  total: number;
}

export interface DiaryContentResponse {
  entry: DiaryEntry;
}

export interface SaveDiaryRequest {
  content: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}
