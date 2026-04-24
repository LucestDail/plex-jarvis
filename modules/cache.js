// JARVIS Cache Client — content script에서 background 캐시에 접근
(() => {
  const send = (type, payload = {}) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[JARVIS cache]', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (e) {
      console.warn('[JARVIS cache] sendMessage 실패:', e);
      resolve(null);
    }
  });

  const getAnalysis = async (url) => (await send('cache:getAnalysis', { url }))?.data ?? null;
  const putAnalysis = async (url, payload, meta) => (await send('cache:putAnalysis', { url, payload, meta }))?.ok === true;
  const deleteAnalysis = async (url) => (await send('cache:deleteAnalysis', { url }))?.ok === true;
  const listAnalysis = async (options) => (await send('cache:listAnalysis', { options }))?.data ?? [];
  const clearAnalysis = async () => (await send('cache:clearAnalysis'))?.ok === true;
  const updateTags = async (url, tags) => (await send('cache:updateTags', { url, tags }))?.ok === true;
  const listAllTags = async () => (await send('cache:listAllTags'))?.data ?? [];
  const getChat = async (url) => (await send('cache:getChat', { url }))?.data ?? [];
  const putChat = async (url, messages) => (await send('cache:putChat', { url, messages }))?.ok === true;
  const clearChat = async () => (await send('cache:clearChat'))?.ok === true;

  const addWatch = async (url, title, interval) => (await send('watch:add', { url, title, interval }))?.ok === true;
  const removeWatch = async (url) => (await send('watch:remove', { url }))?.ok === true;
  const listWatch = async () => (await send('watch:list'))?.data ?? [];
  const isWatched = async (url) => (await send('watch:isWatched', { url }))?.data === true;
  const listHistory = async (url) => (await send('watch:listHistory', { url }))?.data ?? [];

  window.JARVIS = window.JARVIS || {};
  window.JARVIS.Cache = {
    getAnalysis, putAnalysis, deleteAnalysis, listAnalysis, clearAnalysis,
    updateTags, listAllTags,
    getChat, putChat, clearChat,
    addWatch, removeWatch, listWatch, isWatched, listHistory,
  };
})();
