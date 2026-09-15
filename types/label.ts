import configuredLabels from '@/config/labels.json';

export interface Label {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_LABELS: Label[] = configuredLabels;
