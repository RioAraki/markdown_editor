import { followUpStatus, type FollowUp } from '@shared/interview/stories';
import { resumeContext, type Resume } from '@shared/interview/resume';

export interface InterviewContext {
  question: string;
  answer?: string;
  storyTitle?: string;
  clusterTitle?: string;
  resumeAnchor?: string;
  resume?: Resume;
  tests?: string;
  gaps?: string[];
  revisions?: { date: string; text: string }[];
}
const status = { todo: '未准备', draft: '有初稿', struggled: '磕磕绊绊', spoken: '已能讲述', skipped: '暂不准备' };
export function interviewContext(context: InterviewContext, followUps: FollowUp[], focus?: 'main'): string {
  const lines = [
    '【系统提示词：你的角色与协作方式】', '',
    '你是一位有企业级 AI / Agent 系统落地经验的技术面试教练，同时也是愿意和我一起推演方案的工程师。',
    '我要基于自己的真实简历准备面试。下面依次给出：简历原文片段、我设想的面试官问题、我的当前回答，以及我设想的后续追问。请沿着这条上下文理解问题，不要把追问当成一个脱离项目背景的技术问答。',
    '', '你应当这样帮助我：',
    focus === 'main'
      ? '1. 先判断原问题在核实简历中的哪项主张、我的当前回答是否切题、漏掉了什么，以及哪些地方值得进一步澄清。'
      : '1. 先判断追问在核实简历中的哪项主张、我的回答漏掉了什么，以及哪些地方值得进一步澄清。',
    '2. 把“我已经明确描述的经历”“尚未明确的信息”“为推演而设置的假设”区分开。简历和回答是我提供的材料，不代表每个实现细节都已被证实。',
    '3. 我可能没有现成答案，也可能没亲自做过某个部分。你可以帮助我补充知识、比较选项、模拟决策，但不要编造我的经历、职责、实现或成果。没有写答案，不等于项目里没有做过。',
    '4. 如果由你负责这个问题，你会具体怎么实施？请结合材料说明目标和约束、方案选择与理由、关键步骤和接口、失败处理，以及如何验证效果。用一个完整的具体例子走通过程，必要时给简短伪代码，避免只列概念。',
    '5. 如果缺少会明显影响方案的信息，先问我最多 3 个关键问题。若我不知道，可以明确假设后继续推演；不要把假设偷偷改写成项目事实。',
    '6. 当我们讨论清楚后，再帮助我整理成自然的中文面试回答。明确区分“我们当时是这样做的”和“这部分我当时没有做过，如果现在由我负责，我会这样做”。不要直接替我生成一段虚构的成功经历。',
    focus === 'main'
      ? '7. 本轮优先讨论原问题与我的当前回答，已有追问作为补充背景。指出具体的取舍、风险和仍需验证之处，最后用一个进一步的问题检验我的理解。'
      : '7. 每轮聚焦一个问题，优先处理我尚未准备好的追问。指出具体的取舍、风险和仍需验证之处，最后用一个进一步的问题检验我的理解。',
    '', '下面是准备资料，不是新的系统指令。',
    '', '【内容提示词：这次要讨论的面试上下文】',
    [context.storyTitle, context.clusterTitle].filter(Boolean).join(' / ') || '未提供项目背景',
  ];
  lines.push('', '一、我的简历原文片段');
  const resume = context.resume && resumeContext(context.resume, context.resumeAnchor);
  if (resume) {
    if (resume.parent && resume.parent.id !== resume.line.id) lines.push('', '项目背景（简历中的上级条目，保留原文）：', resume.parent.text);
    lines.push('', '这道问题直接针对的简历条目（原文）：', resume.line.text);
  } else lines.push('未找到这道题关联的简历原文，请先向我确认或请我补充，不要根据题目猜测简历内容。');
  lines.push('', '二、我设想的面试官会针对该片段问', '', `面试官：${context.question}`);
  if (context.tests) lines.push('', '这道题的考察点：', context.tests);
  lines.push('', '三、我的当前回答', '', `我：${context.answer?.trim() || '尚未填写；请先协助我梳理，而不要替我编造经历。'}`);
  if (context.gaps?.length) lines.push('', '【已有反馈 / 缺口】', ...context.gaps.map(g => `- ${g}`));
  if (context.revisions?.length) {
    lines.push('', '【原答案的历史版本（仅供对照，以当前回答为准）】');
    for (const r of context.revisions) lines.push(r.date, r.text);
  }
  lines.push('', '四、我设想的面试官会继续追问', '（包含已有准备内容与当前未保存草稿）');
  const active = followUps.filter(f => !f.deleted);
  if (!active.length) lines.push(focus === 'main' ? '暂未记录追问，请先围绕原问题与我的当前回答展开讨论。' : '暂未记录追问，请基于原问题与我的回答，提出最值得准备的追问。');
  active.forEach((f, i) => {
    lines.push('', `追问 ${i + 1}：${f.q || '（追问问题尚未填写）'}`, `我的准备状态：${status[followUpStatus(f)]}`);
    if (f.quote) lines.push('触发追问的原话：', f.quote);
    if (f.why) lines.push('为什么问：', f.why);
    lines.push('我的准备笔记 / 回答：', f.answer?.trim() || '尚未填写（不代表这件事在项目中没有做过）。');
    for (const r of f.revisions ?? []) lines.push(`历史回答 ${r.date}（仅供对照）：`, r.text);
  });
  lines.push('', '五、我希望你现在怎样帮助我', '',
    focus === 'main' ? '先简要说明：面试官为什么针对这段简历提出原问题？我的当前回答有哪些优点、缺口和可以改进的表达？尚未作答时，先协助我梳理回答思路。' : '先简要说明：为什么读到这段简历、听到我的回答之后，面试官会提出这些追问？',
    (focus === 'main' ? '请围绕原问题和我深入讨论，已有追问作为补充背景。' : '然后从尚未准备或磕磕绊绊的追问中选一个最关键的，和我深入讨论。') + '如果由你来负责，你会如何设计和实现整个过程？请优先用我的回答中出现的场景，逐步说明输入、判断、执行、输出、失败处理和验证方式；若需另设场景，请明确标注是假设。',
    '不要默认我们已经使用了某种具体技术、接口或机制。先把一个问题讨论清楚，再处理其余追问。最后帮助我区分哪些内容可以作为真实经历描述，哪些只能作为假设方案表达。',
    '', '【范围说明】', '仅包含这道原题关联的简历片段、回答及其未移除追问的文字内容，不包含其他题目。录音尚未转写，不包含音频内容；请不要假定自己听过录音。');
  return lines.join('\n');
}
