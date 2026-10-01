export function AnswerTimestamps({ createdAt, updatedAt }: { createdAt?: string; updatedAt?: string }) {
  const display = (value?: string) => {
    if (!value) return '未记录';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}（旧记录仅有日期）`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '未记录' : date.toLocaleString('zh-CN', { hour12: false });
  };
  return <p className="text-[11px] text-stone-500">首次创建：{display(createdAt)} · 最后修改：{display(updatedAt)}</p>;
}
