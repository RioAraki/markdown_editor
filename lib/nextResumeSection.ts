export interface ResumeSectionQuestion {
  id: string;
  q: string;
  storyId: string;
  storyTitle: string;
  clusterId?: string;
  clusterTitle: string;
}

export function resumeSectionKey(q: ResumeSectionQuestion): string {
  return JSON.stringify([q.storyId, q.clusterId ?? q.clusterTitle]);
}

/** Manual continuation follows bank order, independently of answer status. */
export function nextResumeSection(
  meta: Record<string, ResumeSectionQuestion>,
  units: { trailing: string }[],
) {
  const groups = new Map<string, ResumeSectionQuestion[]>();
  for (const q of Object.values(meta)) {
    const key = resumeSectionKey(q);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }
  const sections = [...groups.values()];
  const included = new Set(units.map(u => /^\[([^\]]+)\]/.exec(u.trailing.trim())?.[1]).filter(Boolean));
  let last = -1;
  sections.forEach((questions, index) => {
    if (questions.some(q => included.has(q.id))) last = index;
  });
  // Unknown/obsolete question IDs cannot safely identify a continuation point.
  if (last < 0) return undefined;
  return sections.slice(last + 1).find(questions => questions.length > 0);
}
