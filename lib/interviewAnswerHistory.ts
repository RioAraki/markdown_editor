import { taskName, type InterviewDayDoc, type UnitStatus } from '@/types/interview';

export function behavioralHistory(days: InterviewDayDoc[], itemId: string) {
  return days.flatMap(day => {
    const tasks = Object.entries(day.itemsByTask).filter(([, id]) => id === itemId).map(([name]) => name);
    return day.blocks.flatMap(block => {
      if (block.kind !== 'task' && block.kind !== 'task-units') return [];
      const name = taskName(block.label);
      if (!tasks.includes(name)) return [];
      const units = block.kind === 'task' ? [block] : block.units;
      const note = day.blocks.flatMap(b => b.kind === 'notes' ? b.entries : []).filter(n => n.name === name).map(n => n.note).filter(Boolean).join('\n\n');
      return units.map(unit => ({ date: day.dateStr, status: unit.status as UnitStatus, text: unit.trailing.trim(), note }));
    });
  }).sort((a, b) => b.date.localeCompare(a.date));
}
