export interface Label {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_LABELS: Label[] = [
  { id: '1', name: 'Work', color: '#3b82f6' },
  { id: '2', name: 'Personal', color: '#10b981' },
  { id: '3', name: 'Ideas', color: '#f59e0b' },
  { id: '4', name: 'Goals', color: '#8b5cf6' },
  { id: '5', name: 'Reflection', color: '#ec4899' },
  { id: '6', name: 'Travel', color: '#06b6d4' },
];
