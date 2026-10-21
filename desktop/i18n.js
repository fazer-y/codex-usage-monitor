'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.codexUsageI18n = api;
})(globalThis, function () {
  const messages = {
    en: {
      waiting: 'Waiting for a conversation', status: 'Status', readLocal: 'Reading local session statistics',
      followCurrent: 'Following the current Codex conversation', recentActivity: 'Most recently active conversation',
      currentConversation: 'Current conversation', model: 'Model', currentTurn: 'Current turn',
      turnSummary: '{steps} steps · {tools} tool calls · {elapsed}', turnTokens: 'Turn tokens',
      tokenPair: '{input} input · {output} output', sessionTokens: 'Session tokens',
      sessionTokenPair: '{input} input · {output} output · {turns} turns', cacheRead: 'Cache reads',
      cacheSummary: '{tokens} tokens · {percent} hit rate', requestsTools: 'Requests / tools',
      requestSummary: '{requests} requests · {tools} tool calls', firstResponse: 'First token', speed: 'Throughput',
      speedRequests: '{speed} · {requests} model requests', timingBasis: 'Timing',
      speedDescription: 'Estimated over model-request time, excluding tool waits; tokens include reasoning and time includes network, queuing, and prefill',
      toolDuration: 'Tool time', requestRates: 'Request rates',
      rateSummary: 'Input ${input} · cache read {cached} · output ${output} / million tokens',
      costBreakdown: 'Cost breakdown', costSummary: 'Input {input} · cache read {cached} · cache write {writes} · output {output}',
      cacheSavings: 'Cache savings', quotaUsed: 'Quota used', cache: 'Cache', context: 'Context',
      stepNumber: 'Step {value}', turnNumber: 'Turn {value}', tools: 'Tools', toolCount: '{value}', elapsed: 'Time', turnOutput: 'Turn output',
      cacheDescription: 'Session cache-read tokens / session input tokens', contextDescription: 'Latest request input / model context window',
      tokensDescription: 'Total session input and output tokens', stepsDescription: 'Model requests in the current turn',
      turnsDescription: 'Total conversation turns', toolsDescription: 'Tool calls in the current turn', elapsedDescription: 'Total time in the current turn',
      firstResponseDescription: 'First-token latency recorded in the log', outputDescription: 'Output tokens in the current turn',
      costDescription: 'Estimated with public Standard API token prices', costEstimate: 'API equivalent {price}', priceTable: 'Price table',
      showStrip: 'Show statistics strip', dockTitlebar: 'Center in the Codex titlebar', refresh: 'Refresh', quit: 'Quit',
      detach: 'Detach', expandDetails: 'Expand usage details', collapseDetails: 'Collapse usage details',
      foldStrip: 'Fold strip to the right', expandStrip: 'Expand statistics strip',
      detailsLabel: 'Conversation usage details', stripLabel: 'Codex conversation statistics', dragStrip: 'Drag to move the strip',
      reasoning: 'Reasoning effort: {effort}', readingUsage: 'Reading local usage', readFailed: 'Unable to read usage',
      unavailable: 'Usage is unavailable', noSessions: 'Waiting for a Codex conversation.',
      selectedLogMissing: 'Waiting for the selected conversation log.', noUsage: 'Waiting for usage in the selected conversation.',
    },
    'zh-CN': {
      waiting: '等待会话', status: '状态', readLocal: '读取本地会话统计',
      followCurrent: '跟随 Codex 当前会话', recentActivity: '最近活动会话', currentConversation: '当前会话',
      model: '模型', currentTurn: '本轮', turnSummary: '{steps} 步 · {tools} 次工具调用 · {elapsed}',
      turnTokens: '本轮 Token', tokenPair: '{input} 输入 · {output} 输出', sessionTokens: '会话 Token',
      sessionTokenPair: '{input} 输入 · {output} 输出 · {turns} 轮', cacheRead: '缓存读取',
      cacheSummary: '{tokens} Token · 命中率 {percent}', requestsTools: '请求 / 工具',
      requestSummary: '{requests} 次请求 · {tools} 次工具调用', firstResponse: '首响应', speed: '吞吐',
      speedRequests: '{speed} · {requests} 次模型请求', timingBasis: '计时口径',
      speedDescription: '按模型请求区间估算，剔除工具等待；Token 包含思考，耗时包含网络、排队和预填充',
      toolDuration: '工具累计耗时', requestRates: '本次请求单价',
      rateSummary: '输入 ${input} · 缓存读取 {cached} · 输出 ${output} / 百万 Token',
      costBreakdown: '费用明细', costSummary: '输入 {input} · 缓存读取 {cached} · 缓存写入 {writes} · 输出 {output}',
      cacheSavings: '缓存节省', quotaUsed: '额度已用', cache: '缓存', context: '上下文',
      stepNumber: '第{value}步', turnNumber: '第{value}轮', tools: '工具', toolCount: '{value}次', elapsed: '耗时', turnOutput: '本轮输出',
      cacheDescription: '会话缓存读取 Token / 会话输入 Token', contextDescription: '最近一次请求输入 / 模型上下文窗口',
      tokensDescription: '会话累计输入和输出 Token', stepsDescription: '当前轮模型请求次数', turnsDescription: '会话累计轮数',
      toolsDescription: '当前轮工具调用次数', elapsedDescription: '当前轮总耗时', firstResponseDescription: '日志记录的首个 Token 延迟',
      outputDescription: '当前轮累计输出 Token', costDescription: '按公开 API Standard Token 价目表估算',
      costEstimate: 'API 等价估算 {price}', priceTable: '价目表',
      showStrip: '显示统计条', dockTitlebar: '居中吸附到 Codex 标题栏', refresh: '刷新', quit: '退出',
      detach: '解除吸附', expandDetails: '展开用量详情', collapseDetails: '收起用量详情',
      foldStrip: '向右收起统计条', expandStrip: '展开统计条', detailsLabel: '会话用量详情', stripLabel: 'Codex 会话统计',
      dragStrip: '拖动统计条以调整位置', reasoning: '思考强度：{effort}', readingUsage: '正在读取本地用量',
      readFailed: '读取失败', unavailable: '暂时无法读取统计', noSessions: '等待 Codex 会话。',
      selectedLogMissing: '等待当前会话的日志。', noUsage: '等待当前会话的用量记录。',
    },
    'zh-TW': {
      waiting: '等待對話', status: '狀態', readLocal: '讀取本機對話統計',
      followCurrent: '跟隨 Codex 目前對話', recentActivity: '最近使用的對話', currentConversation: '目前對話',
      model: '模型', currentTurn: '本輪', turnSummary: '{steps} 步 · {tools} 次工具呼叫 · {elapsed}',
      turnTokens: '本輪 Token', tokenPair: '{input} 輸入 · {output} 輸出', sessionTokens: '對話 Token',
      sessionTokenPair: '{input} 輸入 · {output} 輸出 · {turns} 輪', cacheRead: '快取讀取',
      cacheSummary: '{tokens} Token · 命中率 {percent}', requestsTools: '請求 / 工具',
      requestSummary: '{requests} 次請求 · {tools} 次工具呼叫', firstResponse: '首次回應', speed: '吞吐',
      speedRequests: '{speed} · {requests} 次模型請求', timingBasis: '計時方式',
      speedDescription: '依模型請求區間估算，扣除工具等待；Token 包含推理，時間包含網路、排隊及預填充',
      toolDuration: '工具累計時間', requestRates: '本次請求單價',
      rateSummary: '輸入 ${input} · 快取讀取 {cached} · 輸出 ${output} / 百萬 Token',
      costBreakdown: '費用明細', costSummary: '輸入 {input} · 快取讀取 {cached} · 快取寫入 {writes} · 輸出 {output}',
      cacheSavings: '快取節省', quotaUsed: '已用額度', cache: '快取', context: '上下文',
      stepNumber: '第{value}步', turnNumber: '第{value}輪', tools: '工具', toolCount: '{value}次', elapsed: '耗時', turnOutput: '本輪輸出',
      cacheDescription: '對話快取讀取 Token / 對話輸入 Token', contextDescription: '最近一次請求輸入 / 模型上下文視窗',
      tokensDescription: '對話累計輸入及輸出 Token', stepsDescription: '本輪模型請求次數', turnsDescription: '對話累計輪數',
      toolsDescription: '本輪工具呼叫次數', elapsedDescription: '本輪總時間', firstResponseDescription: '日誌記錄的首個 Token 延遲',
      outputDescription: '本輪累計輸出 Token', costDescription: '依公開 API Standard Token 價目表估算',
      costEstimate: 'API 等價估算 {price}', priceTable: '價目表',
      showStrip: '顯示統計列', dockTitlebar: '置中吸附至 Codex 標題列', refresh: '重新整理', quit: '結束',
      detach: '解除吸附', expandDetails: '展開用量詳情', collapseDetails: '收合用量詳情',
      foldStrip: '向右收合統計列', expandStrip: '展開統計列', detailsLabel: '對話用量詳情', stripLabel: 'Codex 對話統計',
      dragStrip: '拖曳統計列以調整位置', reasoning: '推理強度：{effort}', readingUsage: '正在讀取本機用量',
      readFailed: '讀取失敗', unavailable: '暫時無法讀取統計', noSessions: '等待 Codex 對話。',
      selectedLogMissing: '等待目前對話的日誌。', noUsage: '等待目前對話的用量記錄。',
    },
  };

  function resolveLocale(value) {
    const locale = String(value || '').replaceAll('_', '-').toLowerCase();
    if (/^zh(?:-|$)/.test(locale)) return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(locale) ? 'zh-TW' : 'zh-CN';
    return 'en';
  }

  function translator(locale) {
    const dictionary = messages[resolveLocale(locale)];
    return (key, values = {}) => (dictionary[key] || messages.en[key] || key)
      .replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
  }

  return { resolveLocale, translator, messages };
});
