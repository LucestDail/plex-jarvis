// JARVIS Background Service Worker — 활성화 조정 + 캐시 라우팅 + 페이지 감시
importScripts('background/cache.js');

const ALARM_NAME = 'jarvis-watch-check';
const activeTabs = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') activeTabs.delete(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

const scheduleActivation = (tabId, delayMs) => {
  setTimeout(() => {
    if (activeTabs.has(tabId)) return;
    chrome.tabs.sendMessage(tabId, { type: 'activateJarvis' })
      .then(() => { activeTabs.set(tabId, true); })
      .catch(() => { activeTabs.delete(tabId); });
  }, Math.max(0, delayMs));
};

const Cache = () => self.JarvisCacheCore;

const respond = (promise, sendResponse, okKey = 'data') => {
  promise
    .then((data) => sendResponse({ ok: true, [okKey]: data }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (!type) return;

  // ===== 활성화 =====
  if (type === 'checkActivation') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ shouldActivate: false }); return; }
    if (activeTabs.has(tabId)) {
      sendResponse({ shouldActivate: false, reason: 'already_activated' });
      return;
    }
    chrome.storage.local.get(['apiKey', 'autoActivate', 'activationDelayMs'], (result) => {
      if (!result.apiKey) { sendResponse({ shouldActivate: false, reason: 'no_api_key' }); return; }
      if (result.autoActivate === false) { sendResponse({ shouldActivate: false, reason: 'auto_activate_disabled' }); return; }
      const delay = typeof result.activationDelayMs === 'number' ? result.activationDelayMs : 2500;
      scheduleActivation(tabId, delay);
      sendResponse({ shouldActivate: true, delayMs: delay });
    });
    return true;
  }

  if (type === 'jarvisActivated') {
    const tabId = sender.tab?.id;
    if (tabId) activeTabs.set(tabId, true);
    sendResponse({ success: true });
    return;
  }

  // ===== 캐시 =====
  if (type === 'cache:getAnalysis') return respond(Cache().getAnalysis(message.url), sendResponse);
  if (type === 'cache:putAnalysis') return respond(Cache().putAnalysis(message.url, message.payload || {}, message.meta || {}), sendResponse, 'ok');
  if (type === 'cache:deleteAnalysis') return respond(Cache().deleteAnalysis(message.url), sendResponse, 'ok');
  if (type === 'cache:listAnalysis') return respond(Cache().listAnalysis(message.options || {}), sendResponse);
  if (type === 'cache:clearAnalysis') return respond(Cache().clearAnalysis(), sendResponse, 'ok');
  if (type === 'cache:updateTags') return respond(Cache().updateTags(message.url, message.tags || []), sendResponse, 'ok');
  if (type === 'cache:listAllTags') return respond(Cache().listAllTags(), sendResponse);
  if (type === 'cache:getChat') return respond(Cache().getChat(message.url), sendResponse);
  if (type === 'cache:putChat') return respond(Cache().putChat(message.url, message.messages || []), sendResponse, 'ok');
  if (type === 'cache:clearChat') return respond(Cache().clearChat(), sendResponse, 'ok');

  // ===== 감시 =====
  if (type === 'watch:add') {
    return respond((async () => {
      await Cache().addWatch(message.url, message.title, message.interval || 60);
      await ensureWatchAlarm();
      return true;
    })(), sendResponse, 'ok');
  }
  if (type === 'watch:remove') {
    return respond((async () => {
      const ok = await Cache().removeWatch(message.url);
      const list = await Cache().listWatch();
      if (list.length === 0) await chrome.alarms.clear(ALARM_NAME);
      return ok;
    })(), sendResponse, 'ok');
  }
  if (type === 'watch:list') return respond(Cache().listWatch(), sendResponse);
  if (type === 'watch:isWatched') return respond(Cache().isWatched(message.url), sendResponse);
  if (type === 'watch:listHistory') return respond(Cache().listHistory(message.url), sendResponse);
  if (type === 'watch:clearHistory') return respond(Cache().clearHistory(), sendResponse, 'ok');

  // ===== Popup → Content 릴레이 =====
  if (type === 'popup:reanalyzeActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) { sendResponse({ ok: false, error: 'no active tab' }); return; }
      activeTabs.delete(tab.id);
      chrome.tabs.sendMessage(tab.id, { type: 'reanalyze' })
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    });
    return true;
  }
  if (type === 'popup:invalidateActiveTabCache') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) { sendResponse({ ok: false, error: 'no active tab' }); return; }
      chrome.tabs.sendMessage(tab.id, { type: 'invalidateCache' })
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    });
    return true;
  }
});

// ===== Watch Alarm =====
const ensureWatchAlarm = async () => {
  const list = await Cache().listWatch();
  if (list.length === 0) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 15, delayInMinutes: 1 });
  }
};

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    await runWatchCheck();
  } catch (e) {
    console.error('[JARVIS watch]', e);
  }
});

const fetchSignatureFor = async (url) => {
  // 백그라운드에서 URL의 최소 시그니처를 가져옴 — HTML을 받아 주요 태그 카운트 + 제목 기반
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').slice(0, 80);
    const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
    const aCount = (html.match(/<a[\s>]/gi) || []).length;
    // 가격/수량 관련 흔한 패턴
    const priceHints = (html.match(/[$€£¥₩]\s?\d[\d,.]*/g) || []).slice(0, 5).join('|');
    const stockHints = (html.match(/in\s?stock|out\s?of\s?stock|재고\s?있음|품절|sold\s?out|available/gi) || []).slice(0, 3).join('|');
    const signature = `${title}|${h1}|h2:${h2Count}|a:${aCount}|p:${priceHints}|s:${stockHints}`;
    return { signature, title, priceHints, stockHints };
  } catch (e) {
    console.warn('[JARVIS watch fetch]', url, e.message);
    return null;
  }
};

const runWatchCheck = async () => {
  const list = await Cache().listWatch();
  for (const watch of list) {
    const fresh = await fetchSignatureFor(watch.url);
    if (!fresh) continue;
    const prev = watch.signature || '';
    if (fresh.signature !== prev) {
      await Cache().updateWatchState(watch.url, {
        signature: fresh.signature,
        lastChecked: Date.now(),
        title: watch.title || fresh.title,
      });
      await Cache().addHistory(watch.url, {
        signature: fresh.signature,
        summary: `변경 감지 — 제목: ${fresh.title || '(없음)'}`,
        note: [fresh.priceHints ? `가격: ${fresh.priceHints}` : '', fresh.stockHints ? `재고: ${fresh.stockHints}` : ''].filter(Boolean).join(' / '),
      });
      // 알림 생성
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'JARVIS — 페이지 변경 감지',
          message: `${watch.title || watch.url}\n${fresh.priceHints || fresh.title || ''}`,
          contextMessage: watch.url.slice(0, 90),
        });
      }
    } else {
      await Cache().updateWatchState(watch.url, { lastChecked: Date.now() });
    }
  }
};

chrome.runtime.onStartup.addListener(() => { ensureWatchAlarm(); });

chrome.runtime.onInstalled.addListener(() => {
  console.log('JARVIS 확장 프로그램이 설치/업데이트되었습니다.');
  chrome.storage.local.get(['cacheEnabled', 'cacheTtlHours', 'activationDelayMs', 'autoTranslate'], (res) => {
    const defaults = {};
    if (res.cacheEnabled === undefined) defaults.cacheEnabled = true;
    if (res.cacheTtlHours === undefined) defaults.cacheTtlHours = 24;
    if (res.activationDelayMs === undefined) defaults.activationDelayMs = 2500;
    if (res.autoTranslate === undefined) defaults.autoTranslate = true;
    if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
  });
  ensureWatchAlarm();
});

chrome.notifications?.onClicked.addListener(async (notificationId) => {
  // 알림 클릭 시 감시 중인 URL 목록을 리뷰할 수 있는 팝업 여는 동작 생략 (MV3 제약).
  // 대신 가장 최근 변경된 URL의 탭 열기.
  try {
    const list = await Cache().listWatch();
    const latest = list.sort((a, b) => b.lastChecked - a.lastChecked)[0];
    if (latest) chrome.tabs.create({ url: latest.url });
  } catch (_) {}
});
