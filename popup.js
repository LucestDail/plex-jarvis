// JARVIS Popup — 설정, 캐시, 감시 관리

const $ = (sel) => document.querySelector(sel);

const send = (type, payload = {}) => new Promise((resolve) => {
  chrome.runtime.sendMessage({ type, ...payload }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(chrome.runtime.lastError.message);
      resolve(null);
      return;
    }
    resolve(response);
  });
});

const showStatus = (message, type) => {
  const el = $('#status-message');
  el.textContent = message;
  el.className = `status-message ${type}`;
  if (type === 'success') {
    setTimeout(() => {
      el.style.display = 'none';
      el.className = 'status-message';
    }, 2000);
  }
};

const fmt = (t) => {
  if (!t) return '-';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ===== Settings =====
const loadSettings = async () => {
  const keys = ['geminiModel', 'apiKey', 'autoActivate', 'cacheEnabled', 'cacheTtlHours', 'activationDelayMs', 'autoTranslate'];
  const r = await chrome.storage.local.get(keys);
  if (r.geminiModel) $('#gemini-model').value = r.geminiModel;
  if (r.apiKey) $('#api-key').value = r.apiKey;
  $('#auto-activate').checked = r.autoActivate !== false;
  $('#cache-enabled').checked = r.cacheEnabled !== false;
  $('#cache-ttl').value = typeof r.cacheTtlHours === 'number' ? r.cacheTtlHours : 24;
  $('#auto-translate').checked = r.autoTranslate !== false;
  const delaySec = typeof r.activationDelayMs === 'number' ? Math.round(r.activationDelayMs / 1000) : 2;
  $('#activation-delay').value = delaySec;
};

const saveSettings = async () => {
  const apiKey = $('#api-key').value.trim();
  if (!apiKey) { showStatus('API 키를 입력해주세요.', 'error'); return; }
  const ttl = parseInt($('#cache-ttl').value, 10);
  const delaySec = parseInt($('#activation-delay').value, 10);
  try {
    await chrome.storage.local.set({
      geminiModel: $('#gemini-model').value,
      apiKey,
      autoActivate: $('#auto-activate').checked,
      cacheEnabled: $('#cache-enabled').checked,
      cacheTtlHours: Number.isFinite(ttl) && ttl > 0 ? ttl : 24,
      activationDelayMs: Number.isFinite(delaySec) && delaySec >= 0 ? delaySec * 1000 : 2500,
      autoTranslate: $('#auto-translate').checked,
    });
    showStatus('설정이 저장되었습니다!', 'success');
  } catch (e) {
    showStatus('설정 저장 중 오류가 발생했습니다.', 'error');
    console.error(e);
  }
};

const testApiKey = async () => {
  const apiKey = $('#api-key').value.trim();
  const model = $('#gemini-model').value;
  if (!apiKey) { showStatus('API 키를 입력해주세요.', 'error'); return; }
  showStatus('API 키를 검증 중...', 'info');
  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 4 },
      }),
    });
    if (res.ok) {
      showStatus(`✅ 키가 유효합니다 (${model}).`, 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      showStatus(`❌ ${res.status} — ${data.error?.message || '키 검증 실패'}`, 'error');
    }
  } catch (e) {
    showStatus(`❌ ${e.message}`, 'error');
  }
};

// ===== Cache Tab =====
let currentCacheQuery = '';
let currentCacheTag = '';

const renderTagFilter = async () => {
  const res = await send('cache:listAllTags');
  const tags = (res && res.data) || [];
  const container = $('#cache-tag-filter');
  container.innerHTML = '';
  if (tags.length === 0) return;
  const all = document.createElement('button');
  all.className = 'tag-pill' + (!currentCacheTag ? ' active' : '');
  all.textContent = '전체';
  all.addEventListener('click', () => { currentCacheTag = ''; renderCacheList(); renderTagFilter(); });
  container.appendChild(all);
  tags.slice(0, 12).forEach(({ tag, count }) => {
    const pill = document.createElement('button');
    pill.className = 'tag-pill' + (currentCacheTag === tag ? ' active' : '');
    pill.textContent = `#${tag} (${count})`;
    pill.addEventListener('click', () => {
      currentCacheTag = currentCacheTag === tag ? '' : tag;
      renderCacheList();
      renderTagFilter();
    });
    container.appendChild(pill);
  });
};

const renderCacheList = async () => {
  const res = await send('cache:listAnalysis', { options: { query: currentCacheQuery, tag: currentCacheTag } });
  const items = (res && res.data) || [];
  const list = $('#cache-list');
  $('#cache-count').textContent = `${items.length}개`;
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'cache-empty';
    empty.textContent = currentCacheQuery || currentCacheTag ? '검색 결과가 없습니다.' : '캐시된 분석이 없습니다.';
    list.appendChild(empty);
    return;
  }
  items.forEach((item) => list.appendChild(renderCacheItem(item)));
};

const renderCacheItem = (item) => {
  const li = document.createElement('li');
  li.className = 'cache-item';

  const info = document.createElement('div');
  info.className = 'cache-item-info';

  const title = document.createElement('div');
  title.className = 'cache-item-title';
  title.textContent = item.title || item.url;
  title.title = item.url;

  const meta = document.createElement('div');
  meta.className = 'cache-item-meta';
  const bits = [fmt(item.updatedAt), `요소 ${item.elementCount}개`];
  if (item.translated && item.language) bits.push(`🌐 ${item.language}`);
  meta.textContent = bits.join(' · ');

  const preview = document.createElement('div');
  preview.className = 'cache-item-preview';
  preview.textContent = item.summaryPreview || '';

  // Tags editor
  const tagsRow = document.createElement('div');
  tagsRow.className = 'cache-item-tags';
  (item.tags || []).forEach((t) => {
    const span = document.createElement('span');
    span.className = 'cache-tag';
    span.innerHTML = `#${t} <button class="tag-remove" title="태그 제거">×</button>`;
    span.querySelector('.tag-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      const next = (item.tags || []).filter((x) => x !== t);
      await send('cache:updateTags', { url: item.url, tags: next });
      renderCacheList(); renderTagFilter();
    });
    tagsRow.appendChild(span);
  });
  const addTag = document.createElement('button');
  addTag.className = 'tag-add';
  addTag.textContent = '+ 태그';
  addTag.addEventListener('click', async () => {
    const input = prompt('추가할 태그 (쉼표로 복수 입력)');
    if (!input) return;
    const newTags = input.split(',').map((s) => s.trim()).filter(Boolean);
    const next = Array.from(new Set([...(item.tags || []), ...newTags]));
    await send('cache:updateTags', { url: item.url, tags: next });
    renderCacheList(); renderTagFilter();
  });
  tagsRow.appendChild(addTag);

  info.appendChild(title);
  info.appendChild(meta);
  if (item.summaryPreview) info.appendChild(preview);
  info.appendChild(tagsRow);

  const actions = document.createElement('div');
  actions.className = 'cache-item-actions';
  const openBtn = document.createElement('button');
  openBtn.className = 'tiny-btn';
  openBtn.textContent = '열기';
  openBtn.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
  const delBtn = document.createElement('button');
  delBtn.className = 'tiny-btn danger';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', async () => {
    await send('cache:deleteAnalysis', { url: item.url });
    renderCacheList(); renderTagFilter();
  });
  actions.appendChild(openBtn);
  actions.appendChild(delBtn);

  li.appendChild(info);
  li.appendChild(actions);
  return li;
};

// ===== Watch Tab =====
const renderWatchList = async () => {
  const res = await send('watch:list');
  const items = (res && res.data) || [];
  $('#watch-count').textContent = `${items.length}개`;
  const list = $('#watch-list');
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'cache-empty';
    empty.textContent = '감시 중인 페이지가 없습니다. 분석 패널의 🔕 버튼으로 등록할 수 있습니다.';
    list.appendChild(empty);
    $('#watch-history').innerHTML = '';
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'cache-item';

    const info = document.createElement('div');
    info.className = 'cache-item-info';
    const title = document.createElement('div');
    title.className = 'cache-item-title';
    title.textContent = item.title || item.url;
    title.title = item.url;
    const meta = document.createElement('div');
    meta.className = 'cache-item-meta';
    meta.textContent = `등록 ${fmt(item.createdAt)} · 최종 확인 ${fmt(item.lastChecked)}`;
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'cache-item-actions';
    const openBtn = document.createElement('button');
    openBtn.className = 'tiny-btn';
    openBtn.textContent = '열기';
    openBtn.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    const historyBtn = document.createElement('button');
    historyBtn.className = 'tiny-btn';
    historyBtn.textContent = '이력';
    historyBtn.addEventListener('click', () => showHistory(item.url));
    const delBtn = document.createElement('button');
    delBtn.className = 'tiny-btn danger';
    delBtn.textContent = '중지';
    delBtn.addEventListener('click', async () => {
      await send('watch:remove', { url: item.url });
      renderWatchList();
    });
    actions.appendChild(openBtn);
    actions.appendChild(historyBtn);
    actions.appendChild(delBtn);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
};

const showHistory = async (url) => {
  const res = await send('watch:listHistory', { url });
  const items = (res && res.data) || [];
  const list = $('#watch-history');
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'cache-empty';
    empty.textContent = '이력이 없습니다.';
    list.appendChild(empty);
    return;
  }
  items.forEach((h) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <div class="history-dot"></div>
      <div class="history-body">
        <div class="history-title">${fmt(h.snapshotAt)}</div>
        <div class="history-note">${h.note || h.summary || '변경 감지'}</div>
      </div>
    `;
    list.appendChild(li);
  });
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
      $(`#panel-${btn.dataset.tab}`).classList.remove('hidden');
      if (btn.dataset.tab === 'cache') { renderCacheList(); renderTagFilter(); }
      if (btn.dataset.tab === 'watch') { renderWatchList(); }
    });
  });

  $('#toggle-key').addEventListener('click', () => {
    const input = $('#api-key');
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    $('#toggle-key').textContent = type === 'password' ? '👁️' : '🙈';
  });
  $('#save-btn').addEventListener('click', saveSettings);
  $('#test-key-btn').addEventListener('click', testApiKey);
  $('#api-key').addEventListener('keypress', (e) => { if (e.key === 'Enter') saveSettings(); });

  $('#reanalyze-btn').addEventListener('click', async () => {
    await send('popup:reanalyzeActiveTab');
    showStatus('현재 탭을 재분석합니다.', 'success');
  });
  $('#invalidate-btn').addEventListener('click', async () => {
    await send('popup:invalidateActiveTabCache');
    showStatus('현재 URL 캐시를 삭제했습니다.', 'success');
    renderCacheList();
  });
  $('#clear-all-btn').addEventListener('click', async () => {
    if (!confirm('모든 캐시를 삭제하시겠습니까?')) return;
    await send('cache:clearAnalysis');
    await send('cache:clearChat');
    showStatus('전체 캐시를 삭제했습니다.', 'success');
    renderCacheList(); renderTagFilter();
  });

  const searchInput = $('#cache-search');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentCacheQuery = searchInput.value.trim();
      renderCacheList();
    }, 200);
  });

  await loadSettings();
});
