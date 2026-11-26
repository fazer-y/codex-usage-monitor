'use strict';

const en = {
  showStrip: 'Show usage bar', dockTitlebar: 'Center in the Antigravity title bar', detach: 'Detach',
  foldStrip: 'Collapse bar',
  expandStrip: 'Restore bar', refresh: 'Refresh', quit: 'Quit', waiting: 'Open a conversation',
  pending: 'Waiting for usage', unavailable: 'Usage unavailable', cache: 'Cache',
  ttft: 'First token', output: 'Latest round output', session: 'Conversation', performance: 'Performance',
  tokenUsage: 'Token usage', total: 'Total tokens',
  prompt: 'Input tokens', hit: 'Cache hit rate', cached: 'Cached input tokens', written: 'Cache write tokens',
  outputTokens: 'Output tokens', reasoning: 'Reasoning tokens', rate: 'Generation speed',
  streaming: 'Streaming time', latestPrompt: 'Latest request input', calls: 'Model steps', turns: 'Rounds',
  toolCalls: 'Tool calls', rateHint: 'Latest model call: output tokens divided by streaming time.',
  context: 'Context', tokens: 'Tokens', tools: 'Tools',
  step: count => 'Step ' + count, turn: count => 'Round ' + count,
  cacheHint: 'Cached input divided by total input for this conversation.',
};

const zh = {
  showStrip: '显示统计条', dockTitlebar: '居中吸附到标题栏', detach: '取消吸附',
  foldStrip: '向右收起',
  expandStrip: '恢复统计条', refresh: '刷新', quit: '退出', waiting: '打开一个会话',
  pending: '等待用量数据', unavailable: '用量暂不可读', cache: '缓存',
  ttft: '首字等待', output: '本轮输出', session: '会话', performance: '性能',
  tokenUsage: 'Token 用量', total: '累计 Token',
  prompt: '输入 Token', hit: '缓存命中率', cached: '缓存读取 Token', written: '缓存写入 Token',
  outputTokens: '输出 Token', reasoning: '推理 Token', rate: '生成速度',
  streaming: '生成耗时', latestPrompt: '最近请求输入', calls: '模型步数', turns: '对话轮数',
  toolCalls: '工具调用', rateHint: '最近一次模型调用的输出 Token 除以流式生成耗时。',
  context: '上下文', tokens: 'Token', tools: '工具',
  step: count => '第' + count + '步', turn: count => '第' + count + '轮',
  cacheHint: '整个会话的缓存读取 Token 占输入 Token 的比例。',
};

const labels = ['showStrip', 'dockTitlebar', 'detach', 'foldStrip', 'expandStrip', 'refresh', 'quit'];

function presentation(locale, systemDark, surface) {
  const chinese = /^zh\b/i.test(locale);
  const dictionary = chinese ? zh : en;
  const intl = chinese ? 'zh-CN' : 'en';
  const numbers = new Intl.NumberFormat(intl);
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 1 });
  const fromApp = /^#[0-9a-f]{6}$/i.test(surface || '');
  let dark = systemDark;
  if (fromApp) {
    const channels = surface.slice(1).match(/../g).map(hex => parseInt(hex, 16));
    dark = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 < 120;
  }
  const colors = dark
    ? { surface: fromApp ? surface : '#202228', text: '#f0f1f6', muted: '#b0b4c1', accentText: '#a8bfff',
      line: '#414550', accentSoft: '#2e3854' }
    : { surface: fromApp ? surface : '#f8f9fc', text: '#21242b', muted: '#525b6b', accentText: '#3459ac',
      line: '#dce1ea', accentSoft: '#edf2ff' };

  function count(value, format = numbers) {
    return Number.isFinite(value) ? format.format(value) : '—';
  }

  function seconds(value) {
    return Number.isFinite(value) ? value.toFixed(1) + ' s' : '—';
  }

  function snapshot(session, error) {
    const stats = session?.stats;
    const metrics = [];
    const groups = [];
    const heading = error ? dictionary.unavailable : session ? dictionary.pending : dictionary.waiting;
    const model = stats?.model || '';
    const effort = stats?.effort || '';
    if (stats) {
      const measured = stats.measuredCalls > 0;
      const total = measured ? stats.promptTokens + stats.outputTokens : null;
      const hitRate = count(stats.hitRate, percent);
      const rate = Number.isFinite(stats.tokensPerSecond) ? Math.round(stats.tokensPerSecond) + ' token/s' : '—';
      function addMetric(kind, label, value, description) {
        if (value !== '—') metrics.push({ kind, label, value, description });
      }
      addMetric('rate', '', rate, dictionary.rateHint);
      addMetric('cache', dictionary.cache, hitRate, dictionary.cacheHint);
      addMetric('context', dictionary.context, count(stats.lastPromptTokens, compact), dictionary.latestPrompt);
      addMetric('tokens', dictionary.tokens, count(total, compact), dictionary.total);
      if (Number.isFinite(stats.steps)) addMetric('steps', '', dictionary.step(count(stats.steps)), dictionary.calls);
      if (Number.isFinite(stats.turns)) addMetric('turns', '', dictionary.turn(count(stats.turns)), dictionary.turns);
      addMetric('tools', dictionary.tools, count(stats.tools), dictionary.toolCalls);
      addMetric('ttft', dictionary.ttft, seconds(stats.firstTokenSeconds), dictionary.ttft);
      addMetric('output', dictionary.output, count(stats.turnOutputTokens, compact), dictionary.output);
      groups.push({ title: dictionary.performance, rows: [
        [dictionary.rate, rate], [dictionary.ttft, seconds(stats.firstTokenSeconds)],
        [dictionary.streaming, seconds(stats.streamingSeconds)], [dictionary.hit, hitRate],
      ] });
      groups.push({ title: dictionary.tokenUsage, rows: [
        [dictionary.latestPrompt, count(stats.lastPromptTokens)],
        [dictionary.total, count(total)],
        [dictionary.prompt, count(measured ? stats.promptTokens : null)],
        [dictionary.cached, count(measured ? stats.cachedTokens : null)],
        [dictionary.written, count(measured ? stats.writtenTokens : null)],
        [dictionary.outputTokens, count(measured ? stats.outputTokens : null)],
        [dictionary.reasoning, count(measured ? stats.reasoningTokens : null)],
      ] });
      groups.push({ title: dictionary.session, rows: [
        [dictionary.turns, count(stats.turns)], [dictionary.calls, count(stats.steps)],
        [dictionary.toolCalls, count(stats.tools)], [dictionary.output, count(stats.turnOutputTokens)],
      ] });
    }
    return {
      bar: { title: model || heading, effort, metrics },
      details: { lang: intl, dark, conversationTitle: session?.title || heading,
        model, effort, groups },
    };
  }

  return { theme: { colors, labels: Object.fromEntries(labels.map(key => [key, dictionary[key]])) }, snapshot };
}

module.exports = { presentation };
