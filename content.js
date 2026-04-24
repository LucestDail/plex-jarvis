// JARVIS Content Script — 모듈 오케스트레이션
(() => {
  const NS = (window.JARVIS = window.JARVIS || {});

  let activated = false;
  let currentSummary = '';
  let currentPageInfo = null;
  let chatHistory = [];
  let panelHandle = null;
  let mutationObserver = null;
  let incrementalTimer = null;
  let pageLanguage = { lang: '', primary: '', isKorean: true };
  let translatedActive = false;

  const log = (...args) => console.log('[JARVIS]', ...args);
  const err = (...args) => console.error('[JARVIS]', ...args);

  const checkActivation = async () => {
    if (activated) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'checkActivation' });
      if (response && response.shouldActivate) {
        NS.Renderer.showActivationIndicator('waiting');
      }
    } catch (e) { err('activation check 실패:', e); }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'activateJarvis') {
      if (!activated) {
        activated = true;
        activateJarvis().finally(() => {
          chrome.runtime.sendMessage({ type: 'jarvisActivated' }).catch(() => {});
        });
      }
      sendResponse({ success: true });
      return;
    }
    if (message.type === 'invalidateCache') {
      if (NS.Cache) NS.Cache.deleteAnalysis(window.location.href).then(() => sendResponse({ success: true }));
      return true;
    }
    if (message.type === 'reanalyze') {
      activated = false;
      activateJarvis();
      sendResponse({ success: true });
    }
  });

  const getSettings = async () => chrome.storage.local.get([
    'apiKey', 'geminiModel', 'cacheTtlHours', 'cacheEnabled', 'autoTranslate',
  ]);

  const activateJarvis = async () => {
    const indicator = NS.Renderer.showActivationIndicator('loading');

    const settings = await getSettings();
    if (!settings.apiKey) {
      NS.Renderer.setIndicatorState(indicator, 'noKey');
      NS.Renderer.removeIndicator(3000);
      return;
    }

    try {
      currentPageInfo = NS.Collector.collectPageInfo();
      pageLanguage = NS.Collector.detectLanguage();
      const autoTranslate = settings.autoTranslate !== false;
      const shouldTranslate = autoTranslate && !pageLanguage.isKorean && pageLanguage.primary;
      translatedActive = shouldTranslate;

      if (shouldTranslate) NS.Renderer.setIndicatorState(indicator, 'translating');

      const cacheEnabled = settings.cacheEnabled !== false;
      const cached = cacheEnabled ? await NS.Cache.getAnalysis(window.location.href) : null;

      let enhanced = null;
      let isCached = false;

      const cacheMatchesMode = (row) => row && row.translated === shouldTranslate;

      if (cached && !cached.stale && cached.signature === currentPageInfo.signature && cacheMatchesMode(cached)) {
        NS.Renderer.setIndicatorState(indicator, 'cached');
        enhanced = { summary: cached.summary, elements: cached.elements };
        isCached = true;
        translatedActive = !!cached.translated;
      } else {
        enhanced = await NS.Analyzer.analyzePage(currentPageInfo, settings, {
          chunkSize: 12,
          translate: shouldTranslate,
          pageLang: pageLanguage.primary,
        });
        if (cacheEnabled) {
          await NS.Cache.putAnalysis(window.location.href, {
            ...enhanced,
            language: pageLanguage.primary,
            translated: shouldTranslate,
          }, {
            title: currentPageInfo.title,
            signature: currentPageInfo.signature,
          });
        }
      }

      NS.Renderer.setIndicatorState(indicator, 'success');
      NS.Renderer.removeIndicator(1000);

      if (!enhanced || (!enhanced.elements?.length && !enhanced.summary)) {
        NS.Renderer.setIndicatorState(indicator, 'noInfo');
        NS.Renderer.removeIndicator(2000);
        return;
      }

      currentSummary = enhanced.summary || '';
      const prevChat = (await NS.Cache.getChat(window.location.href).catch(() => [])) || [];
      chatHistory = Array.isArray(prevChat) ? prevChat : [];

      const watchEnabled = await NS.Cache.isWatched(window.location.href);

      panelHandle = NS.Renderer.showSummaryPanel({
        summary: currentSummary,
        cached: isCached,
        translated: translatedActive,
        language: pageLanguage.primary,
        watchEnabled,
        onAskStream: handleAskStream,
        onAsk: handleAsk,
        onClose: () => { panelHandle = null; },
        onExportText: () => exportChat('text'),
        onExportMarkdown: () => exportChat('markdown'),
        onToggleWatch: toggleWatch,
        onTranslateAgain: () => retranslate(),
      });

      chatHistory.forEach((m) => {
        panelHandle.appendMessage(m.role === 'user' ? 'user' : 'assistant', m.content);
      });

      const count = NS.Renderer.applyEnhancedInfo(enhanced, currentPageInfo.elementMap, {
        onAsk: (info) => panelHandle?.addFocus(info),
        onCompare: (info) => panelHandle?.addCompare(info),
      });
      log(`${count}개 요소에 증강 정보 추가됨${isCached ? ' (캐시)' : ''}${translatedActive ? ' (번역)' : ''}`);

      setupMutationObserver(settings);
    } catch (e) {
      err('활성화 오류:', e);
      const fallback = await NS.Cache.getAnalysis(window.location.href).catch(() => null);
      if (fallback && fallback.summary) {
        NS.Renderer.setIndicatorState(indicator, 'cached');
        NS.Renderer.removeIndicator(1500);
        currentSummary = fallback.summary;
        const watchEnabled = await NS.Cache.isWatched(window.location.href);
        panelHandle = NS.Renderer.showSummaryPanel({
          summary: currentSummary,
          cached: true,
          translated: !!fallback.translated,
          language: fallback.language,
          watchEnabled,
          onAskStream: handleAskStream,
          onAsk: handleAsk,
          onClose: () => { panelHandle = null; },
          onExportText: () => exportChat('text'),
          onExportMarkdown: () => exportChat('markdown'),
          onToggleWatch: toggleWatch,
        });
        NS.Renderer.applyEnhancedInfo(
          { summary: fallback.summary, elements: fallback.elements },
          currentPageInfo?.elementMap || new Map(),
          {
            onAsk: (info) => panelHandle?.addFocus(info),
            onCompare: (info) => panelHandle?.addCompare(info),
          },
        );
      } else {
        NS.Renderer.setIndicatorState(indicator, 'error', { message: `⚠️ ${e.message}` });
        NS.Renderer.removeIndicator(3000);
      }
    }
  };

  const handleAsk = async (question, focus) => {
    const settings = await getSettings();
    const pageInfo = { title: document.title, url: window.location.href };
    chatHistory.push({ role: 'user', content: question });
    const answer = await NS.Analyzer.chat({
      question, summary: currentSummary, pageInfo,
      history: chatHistory, settings, focus,
    });
    chatHistory.push({ role: 'assistant', content: answer });
    NS.Cache.putChat(window.location.href, chatHistory).catch(() => {});
    return answer;
  };

  const handleAskStream = async (question, focus, onDelta) => {
    const settings = await getSettings();
    const pageInfo = { title: document.title, url: window.location.href };
    chatHistory.push({ role: 'user', content: question });
    try {
      const full = await NS.Analyzer.chatStream({
        question, summary: currentSummary, pageInfo,
        history: chatHistory, settings, focus, onDelta,
      });
      chatHistory.push({ role: 'assistant', content: full });
      NS.Cache.putChat(window.location.href, chatHistory).catch(() => {});
      return full;
    } catch (streamError) {
      console.warn('[JARVIS] 스트리밍 실패, 단일 응답으로 폴백:', streamError.message);
      const answer = await NS.Analyzer.chat({
        question, summary: currentSummary, pageInfo,
        history: chatHistory, settings, focus,
      });
      chatHistory.push({ role: 'assistant', content: answer });
      NS.Cache.putChat(window.location.href, chatHistory).catch(() => {});
      return answer;
    }
  };

  const toggleWatch = async () => {
    const url = window.location.href;
    const now = await NS.Cache.isWatched(url);
    if (now) {
      await NS.Cache.removeWatch(url);
    } else {
      await NS.Cache.addWatch(url, document.title || currentPageInfo?.title || '', 60);
    }
    return !now;
  };

  const retranslate = async () => {
    activated = false;
    await NS.Cache.deleteAnalysis(window.location.href);
    activateJarvis();
  };

  const exportChat = (format) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const hostname = window.location.hostname || 'jarvis';
    const header = `# JARVIS 대화 기록\n\n- URL: ${window.location.href}\n- 제목: ${document.title}\n- 생성: ${new Date().toLocaleString()}\n\n## 요약\n${currentSummary || '(요약 없음)'}\n\n## 대화\n\n`;
    const body = chatHistory.map((m) => {
      const role = m.role === 'user' ? '🧑 사용자' : '🤖 JARVIS';
      return `### ${role}\n\n${m.content}\n`;
    }).join('\n');

    let content;
    let ext;
    let mime;
    if (format === 'markdown') {
      content = header + body;
      ext = 'md';
      mime = 'text/markdown';
    } else {
      content = `${header.replace(/[#*]/g, '')}\n${body.replace(/[#*]/g, '')}`;
      ext = 'txt';
      mime = 'text/plain';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-${hostname}-${ts}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const setupMutationObserver = (settings) => {
    if (mutationObserver) mutationObserver.disconnect();
    mutationObserver = new MutationObserver(() => {
      if (incrementalTimer) clearTimeout(incrementalTimer);
      incrementalTimer = setTimeout(() => {
        if (!document.body) return;
        const fresh = NS.Collector.collectPageInfo();
        if (fresh.signature === currentPageInfo.signature) return;
        const added = NS.Collector.diffAgainst(fresh, currentPageInfo.elements);
        if (added.length === 0) {
          currentPageInfo = fresh;
          return;
        }
        NS.Analyzer.analyzePage(
          { ...fresh, elements: added },
          settings,
          { chunkSize: 8, translate: translatedActive, pageLang: pageLanguage.primary }
        ).then((delta) => {
          NS.Renderer.applyEnhancedInfo(delta, fresh.elementMap, {
            onAsk: (info) => panelHandle?.addFocus(info),
            onCompare: (info) => panelHandle?.addCompare(info),
          });
          currentPageInfo = fresh;
          NS.Cache.getAnalysis(window.location.href).then((existing) => {
            const merged = {
              summary: existing?.summary || currentSummary,
              elements: [...(existing?.elements || []), ...(delta.elements || [])],
              language: pageLanguage.primary,
              translated: translatedActive,
            };
            NS.Cache.putAnalysis(window.location.href, merged, {
              title: fresh.title,
              signature: fresh.signature,
            }).catch(() => {});
          });
        }).catch((e) => err('증분 분석 실패:', e));
      }, 1500);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  };

  const scheduleActivationCheck = () => {
    const run = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => checkActivation(), { timeout: 1500 });
      } else {
        setTimeout(checkActivation, 800);
      }
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  };

  scheduleActivationCheck();
})();
