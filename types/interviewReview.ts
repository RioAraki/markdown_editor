export const REVIEW_BANKS: Record<string, string> = {
  agent: 'Agent 题库', python: 'Python 基本功', backend: '后端八股', quant: '数理统计', depth: 'AI 深度',
};
export type ReviewStatus = '' | 'independent' | 'prompted' | 'struggled';
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  '': '未复习', independent: '独立答出', prompted: '提示后答出', struggled: '仍没掌握',
};
export interface ReviewAttempt { id: string; text: string; createdAt: string; updatedAt: string }
export interface ReviewEntry { status: ReviewStatus; attempts: ReviewAttempt[] }
export interface ReviewRound { id: string; bank: string; createdAt: string; entries: Record<string, ReviewEntry> }
export interface ReviewStore { version: 1; revision: number; rounds: ReviewRound[] }
