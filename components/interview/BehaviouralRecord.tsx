'use client';

import { UnitStatus } from '@/types/interview';
import { UnitRecord } from './UnitRecord';
import { RecordingPanel } from './RecordingPanel';
import { ItemSwap } from './ItemSwap';
import {
  behaviouralRecordingKey,
  behaviouralUnitText,
  parseBehaviouralUnit,
} from '@shared/interview/behavioural';

/**
 * One spoken question inside a 行为故事 slot.
 *
 * Each question owns its recordings, so the takes follow the question rather
 * than the day — swapping or adding a question never mixes one answer's audio
 * into another's history.
 *
 * `fallbackId` covers days written before questions were named on the line:
 * there the subject lives in the `items:` marker, and this renders exactly as
 * it always did.
 */
export function BehaviouralRecord({
  index,
  status,
  trailing,
  dateStr,
  fallbackId,
  task,
  onChange,
  onSwap,
}: {
  index: number;
  status: UnitStatus;
  trailing: string;
  dateStr: string;
  fallbackId?: string;
  task: string;
  onChange: (status: UnitStatus, trailing: string) => void;
  onSwap?: (itemId: string) => Promise<void>;
}) {
  const parsed = parseBehaviouralUnit(trailing);
  const itemId = parsed?.id ?? fallbackId;

  // The notes box edits only the note half. Handing it the raw trailing would
  // show `[bh-cn-intro] 请用中文介绍一下你自己` as if it were something you had
  // written, and typing over it would destroy the question the line names.
  // A day with no id on the line keeps the old behaviour: the whole trailing
  // *is* the note, which is where existing answers already live.
  const noteOf = (t: string) => parseBehaviouralUnit(t)?.note ?? t;
  const handleChange = (next: UnitStatus, text: string) =>
    onChange(next, parsed ? behaviouralUnitText(parsed.id, parsed.title, text) : text);

  return (
    <div className="py-1">
      {parsed?.title && (
        <p className="text-[14px] leading-snug text-stone-800 mb-1">{parsed.title}</p>
      )}
      <UnitRecord
        index={index}
        status={status}
        trailing={noteOf(trailing)}
        dateStr={dateStr}
        onChange={handleChange}
      />
      {itemId && <RecordingPanel key={itemId} questionKey={behaviouralRecordingKey(itemId)} />}
      {itemId && onSwap && <ItemSwap task={task} currentId={itemId} onSwap={onSwap} />}
    </div>
  );
}
