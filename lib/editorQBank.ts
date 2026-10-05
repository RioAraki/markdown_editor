import { loadQBank as loadStandard, loadInterviewPlan } from '@shared/interview/load';
import { bankIdForPool, depthQuestions, legacyDepthLog } from './depthQuestions';

export async function loadQBank(dataDir: string) {
  const [result, plan] = await Promise.all([loadStandard(dataDir), loadInterviewPlan(dataDir)]);
  const legacy = legacyDepthLog(plan);
  for (const [id, rec] of Object.entries(legacy)) {
    const current = result.log[id];
    const dates = new Set(current?.answers.map(a => a.date));
    result.log[id] = { ...rec, ...current, answers: [
      ...rec.answers.filter(a => !dates.has(a.date)), ...(current?.answers ?? []),
    ].sort((a, b) => a.date.localeCompare(b.date)) };
  }
  result.bank.questions.push(...depthQuestions(plan.inventory));
  const blockProgress = Object.fromEntries((plan.blocks ?? []).flatMap(block => {
    const id = bankIdForPool(block.pool ?? []);
    if (!id) return [];
    const qs = result.bank.questions.filter(q => (q.bank ?? 'agent') === id);
    const answered = qs.filter(q => result.log[q.id]?.answers.length).length;
    const redo = qs.filter(q => result.log[q.id]?.redo).length;
    const message = !qs.length ? '题库暂无题目' : answered === qs.length
      ? `题库已全部作答 · ${answered}/${qs.length} 题${redo ? ` · ${redo} 题已标记待重做` : ' · 可在总览回看历史答案'}`
      : `已答 ${answered}/${qs.length} 题`;
    return [[block.name, { total: qs.length, answered, redo, message }]];
  }));
  const reviewCategories = Object.fromEntries(plan.inventory.domains.flatMap(d => d.modules)
    .flatMap(m => m.items.map(i => [i.id, m.label])));
  return { ...result, blockProgress, reviewCategories };
}
