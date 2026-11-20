import { loadLcSync, loadLeetCode } from '@shared/interview/load';
import { computeAbility, type AbilityReport } from '@shared/interview/ability';
import type { LeetCodeLog, ProblemBank } from '@shared/interview/leetcode';
import type { LcSyncState } from '@shared/interview/lcSync';

export interface LeetCodeModel {
  bank: ProblemBank;
  log: LeetCodeLog;
  sync: LcSyncState;
  ability: AbilityReport;
  /** Accepted on leetcode.cn (deep sync) — never offered as new. */
  solved: Set<number>;
}

/** Bank + log + sync state, with ability fitted for `today`. */
export async function loadLeetCodeModel(dataDir: string, today: string): Promise<LeetCodeModel> {
  const [{ bank, log }, sync] = await Promise.all([loadLeetCode(dataDir), loadLcSync(dataDir)]);
  const ability = computeAbility({
    problems: bank.problems,
    topics: bank.topics ?? [],
    log,
    sync,
    today,
  });
  const solved = new Set(
    Object.entries(sync.deep?.questions ?? {})
      .filter(([, q]) => q.status === 'ac')
      .map(([id]) => Number(id)),
  );
  return { bank, log, sync, ability, solved };
}
