import { bankIdForPool as standardBank, parseQuestionUnit, questionKey, type QBankLog, type Question } from '@shared/interview/qbank';
import type { InterviewPlan } from '@shared/interview/types';

export const DEPTH_MODULES = ['ai-rag', 'ai-eval', 'ai-agent', 'ai-obs', 'ai-proj'];
export const depthQuestionId = (itemId: string) => questionKey(itemId, 'depth');
export function bankIdForPool(pool: readonly string[]): string | null {
  return pool.some(id => DEPTH_MODULES.includes(id)) ? 'depth' : standardBank(pool);
}

// Stable inventory ids, rather than titles, preserve answers after renaming a topic.
export function depthQuestions(inventory: InterviewPlan['inventory']): Question[] {
  return inventory.domains.flatMap(d => d.modules)
    .filter(m => DEPTH_MODULES.includes(m.id))
    .flatMap(m => m.items.map(i => ({
      id: depthQuestionId(i.id), bank: 'depth', category: i.id,
      question: i.title, answer: [i.how, i.test && `检验标准：${i.test}`].filter(Boolean).join('\n\n'), url: '',
    }))).map((q, seq) => ({ ...q, seq }));
}

// Read old day records without rewriting them. An explicit topic tag wins over
// the block binding; an empty scheduled checkbox is not an answer.
export function legacyDepthLog(plan: Pick<InterviewPlan, 'logs' | 'inventory'>): QBankLog {
  const valid = new Set(depthQuestions(plan.inventory).map(q => q.category));
  const log: QBankLog = {};
  for (const [date, day] of Object.entries(plan.logs).sort(([a], [b]) => a.localeCompare(b))) {
    for (const item of day.items) {
      const name = item.text.split('·')[0].trim();
      for (const unit of item.sets) {
        if (parseQuestionUnit(unit.text)) continue;
        const tag = /^\[@([a-z0-9-]+)\]\s*(.*)$/.exec(unit.text.trim());
        const itemId = tag?.[1] ?? day.itemsByTask[name];
        if (!valid.has(itemId)) continue;
        const text = tag ? tag[2].split(' · ').slice(1).join(' · ').trim() : unit.text.trim();
        if (!text && unit.status !== 'done') continue;
        const id = depthQuestionId(itemId);
        const rec = log[id] ??= { id, answers: [] };
        rec.answers.push({ date, text: text || '已完成（当天未填写文字答案）' });
      }
    }
  }
  return log;
}
