// JARVIS Renderer Module — 배지, 요약 패널, 채팅 UI (스트리밍/내보내기/하이라이트 지원)
(() => {
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  };

  // ===== 간이 코드 하이라이터 =====
  const HIGHLIGHT_PATTERNS = {
    keyword: /\b(const|let|var|function|return|if|else|for|while|class|import|export|default|async|await|new|this|try|catch|finally|throw|typeof|instanceof|in|of|true|false|null|undefined|break|continue|switch|case|do|void|public|private|protected|static|def|from|as|self|None|True|False|lambda|pass|raise|with|yield|print|package|interface|extends|implements)\b/g,
    string: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g,
    comment: /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g,
    number: /\b(\d+(?:\.\d+)?)\b/g,
  };

  const highlightCode = (code, _lang) => {
    // 순서 주의: 주석 → 문자열 → 키워드 → 숫자
    const placeholders = [];
    const placehold = (match) => {
      placeholders.push(match);
      return `\u0001${placeholders.length - 1}\u0001`;
    };

    let escaped = escapeHtml(code);
    escaped = escaped.replace(HIGHLIGHT_PATTERNS.comment, (m) => placehold(`<span class="jarvis-hl-comment">${m}</span>`));
    escaped = escaped.replace(HIGHLIGHT_PATTERNS.string, (m) => placehold(`<span class="jarvis-hl-string">${m}</span>`));
    escaped = escaped.replace(HIGHLIGHT_PATTERNS.keyword, '<span class="jarvis-hl-keyword">$1</span>');
    escaped = escaped.replace(HIGHLIGHT_PATTERNS.number, '<span class="jarvis-hl-number">$1</span>');
    escaped = escaped.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[Number(idx)]);
    return escaped;
  };

  // ===== 간이 마크다운 렌더러 =====
  const renderMarkdown = (raw) => {
    if (!raw) return '';

    // 1) 코드 블록 먼저 추출 (치환 후 복원)
    const codeBlocks = [];
    let work = String(raw).replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const highlighted = highlightCode(code.replace(/\n$/, ''), lang);
      codeBlocks.push(`<pre class="jarvis-code" data-lang="${lang || ''}"><code>${highlighted}</code></pre>`);
      return `\u0002CODE${codeBlocks.length - 1}\u0002`;
    });

    // 2) 나머지는 HTML escape
    work = escapeHtml(work);

    // 3) 인라인 코드
    work = work.replace(/`([^`]+)`/g, '<code class="jarvis-inline-code">$1</code>');

    // 4) 링크
    work = work.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="jarvis-md-link">$1</a>');

    // 5) bold / italic
    work = work.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    work = work.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6) 목록
    work = work.replace(/(^|\n)((?:- [^\n]+\n?)+)/g, (match, lead, block) => {
      const items = block.trim().split(/\n/).map((l) => l.replace(/^- /, ''));
      return `${lead}<ul class="jarvis-md-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
    });

    // 7) 단락/줄바꿈
    work = work.replace(/\n{2,}/g, '</p><p>');
    work = work.replace(/\n/g, '<br>');

    // 8) 코드 블록 복원 (p 바깥으로 빼기 위해 단락 미리 닫음)
    let html = `<p>${work}</p>`;
    html = html.replace(/\u0002CODE(\d+)\u0002/g, (_, idx) => {
      return `</p>${codeBlocks[Number(idx)]}<p>`;
    });
    html = html.replace(/<p>\s*<\/p>/g, '');

    // 9) 링크 프리뷰 (호스트/파비콘 + 이미지 자동 렌더)
    html = enhanceLinks(html);

    return html;
  };

  const enhanceLinks = (html) => {
    // 이미지 링크(.jpg/.png/.gif/.webp)는 이미지로 인라인
    html = html.replace(/<a class="jarvis-md-link" href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp|svg))"[^>]*>(.*?)<\/a>/gi,
      (_, url, label) => {
        return `<a class="jarvis-md-link" href="${url}" target="_blank" rel="noopener noreferrer">
          <span class="jarvis-img-preview"><img src="${url}" alt="${label}" loading="lazy"/></span>
          <span class="jarvis-link-label">${label}</span>
        </a>`;
      });
    // 일반 링크는 도메인/파비콘 배지 추가
    html = html.replace(/<a class="jarvis-md-link" href="(https?:\/\/([^/"]+)[^"]*)"([^>]*)>(.*?)<\/a>/g,
      (match, url, host, rest, label) => {
        if (match.includes('jarvis-img-preview')) return match;
        const favicon = `https://www.google.com/s2/favicons?sz=32&domain=${host}`;
        return `<a class="jarvis-md-link jarvis-link-rich" href="${url}" target="_blank" rel="noopener noreferrer"${rest}>
          <img class="jarvis-link-favicon" src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'"/>
          <span class="jarvis-link-label">${label}</span>
          <span class="jarvis-link-host">${host}</span>
        </a>`;
      });
    return html;
  };

  // ===== 활성화 인디케이터 =====
  const showActivationIndicator = (state = 'waiting') => {
    const existing = document.getElementById('jarvis-activation-indicator');
    if (existing) existing.remove();
    const indicator = document.createElement('div');
    indicator.id = 'jarvis-activation-indicator';
    setIndicatorState(indicator, state);
    document.body.appendChild(indicator);
    return indicator;
  };

  const setIndicatorState = (indicator, state, extra = {}) => {
    if (!indicator) return;
    const STATES = {
      waiting: { text: 'JARVIS 활성화 대기 중...' },
      loading: { text: 'JARVIS 정보 분석 중...' },
      cached: { text: 'JARVIS 캐시 결과 표시 중...' },
      translating: { text: 'JARVIS 번역 분석 중...' },
      success: { text: 'JARVIS 준비 완료', success: true },
      error: { text: extra.message || '⚠️ 오류 발생', error: true },
      noKey: { text: '⚠️ API 키가 설정되지 않았습니다', error: true },
      noInfo: { text: '정보를 가져올 수 없습니다' },
    };
    const conf = STATES[state] || STATES.waiting;
    indicator.innerHTML = `
      <div class="jarvis-indicator-content">
        <div class="jarvis-indicator-icon">
          ${conf.success ? '✓' : conf.error ? '' : `
            <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3"
                stroke-dasharray="${state === 'loading' || state === 'translating' ? '70 30' : '0'}" stroke-dashoffset="0">
                ${state === 'loading' || state === 'translating' ? '<animate attributeName="stroke-dashoffset" values="0;100" dur="1.5s" repeatCount="indefinite"/>' : ''}
              </circle>
              <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8">
                <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            </svg>`}
        </div>
        <span class="jarvis-indicator-text" ${conf.error ? 'style="color:#ff4444"' : ''}>${escapeHtml(conf.text)}</span>
      </div>
    `;
    if (conf.success) {
      indicator.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.95) 0%, rgba(0, 200, 0, 0.95) 100%)';
    } else if (conf.error) {
      indicator.style.background = 'linear-gradient(135deg, rgba(255, 68, 68, 0.95) 0%, rgba(200, 0, 0, 0.95) 100%)';
    }
  };

  const removeIndicator = (delay = 1000) => {
    const indicator = document.getElementById('jarvis-activation-indicator');
    if (!indicator) return;
    setTimeout(() => {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateX(100%)';
      setTimeout(() => indicator.remove(), 300);
    }, delay);
  };

  // ===== 요소 배지 =====
  const addInfoBadge = (element, info, type, options = {}) => {
    const existingIcon = element.querySelector(':scope > .jarvis-icon');
    if (existingIcon) existingIcon.remove();
    const existingBadge = document.querySelector(
      `.jarvis-badge[data-element-id="${CSS.escape(element.getAttribute('data-jarvis-id') || '')}"]`
    );
    if (existingBadge) existingBadge.remove();

    const style = window.getComputedStyle(element);
    if (style.position === 'static') element.style.position = 'relative';

    const icon = document.createElement('div');
    icon.className = 'jarvis-icon';
    icon.setAttribute('data-element-id', element.getAttribute('data-jarvis-id'));
    icon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3"/>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#00d4ff" stroke-width="2" opacity="0.6"/>
        <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8"/>
      </svg>`;
    element.appendChild(icon);

    const badge = document.createElement('div');
    badge.className = 'jarvis-badge';
    badge.setAttribute('data-type', type);
    badge.setAttribute('data-element-id', element.getAttribute('data-jarvis-id'));

    if (info.enhancedInfo) {
      const infoDiv = document.createElement('div');
      infoDiv.className = 'jarvis-badge-info';
      infoDiv.textContent = info.enhancedInfo;
      badge.appendChild(infoDiv);
    }
    if (info.relatedLinks && info.relatedLinks.length > 0) {
      const linksDiv = document.createElement('div');
      linksDiv.className = 'jarvis-badge-links';
      info.relatedLinks.slice(0, 3).forEach((url) => {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'jarvis-badge-link';
        a.textContent = '🔗 관련 링크';
        linksDiv.appendChild(a);
      });
      badge.appendChild(linksDiv);
    }
    if (info.tags && info.tags.length > 0) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'jarvis-badge-tags';
      info.tags.slice(0, 3).forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'jarvis-badge-tag';
        span.textContent = tag;
        tagsDiv.appendChild(span);
      });
      badge.appendChild(tagsDiv);
    }

    // 요소 지정 질의 / 비교 버튼
    const actions = document.createElement('div');
    actions.className = 'jarvis-badge-actions';
    const askBtn = document.createElement('button');
    askBtn.className = 'jarvis-badge-btn';
    askBtn.textContent = '💬 이것에 대해 질문';
    askBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (options.onAsk) options.onAsk(info, element);
    });
    const compareBtn = document.createElement('button');
    compareBtn.className = 'jarvis-badge-btn';
    compareBtn.textContent = '⚖️ 비교에 추가';
    compareBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (options.onCompare) options.onCompare(info, element);
    });
    actions.appendChild(askBtn);
    actions.appendChild(compareBtn);
    badge.appendChild(actions);

    document.body.appendChild(badge);

    let timeout;
    const positionBadge = () => {
      const rect = icon.getBoundingClientRect();
      badge.style.top = `${rect.bottom + 8}px`;
      badge.style.left = `${rect.left}px`;
    };
    const showBadge = () => {
      clearTimeout(timeout);
      badge.style.display = 'block';
      positionBadge();
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    };
    const hideBadge = () => {
      timeout = setTimeout(() => {
        badge.style.opacity = '0';
        badge.style.transform = 'translateY(-10px)';
        setTimeout(() => { badge.style.display = 'none'; }, 300);
      }, 200);
    };

    icon.addEventListener('mouseenter', showBadge);
    icon.addEventListener('mouseleave', hideBadge);
    badge.addEventListener('mouseenter', () => { clearTimeout(timeout); badge.style.opacity = '1'; badge.style.transform = 'translateY(0)'; });
    badge.addEventListener('mouseleave', hideBadge);

    badge.style.display = 'none';
    badge.style.opacity = '0';
    badge.style.transform = 'translateY(-10px)';
    setTimeout(() => { badge.style.transition = 'all 0.3s ease'; }, 100);

    return { icon, badge };
  };

  const applyEnhancedInfo = (enhancedInfo, elementMap, options = {}) => {
    if (!enhancedInfo || !enhancedInfo.elements) return 0;
    let count = 0;
    enhancedInfo.elements.forEach((info) => {
      if (!info.identifier || !info.enhancedInfo) return;
      let el = elementMap.get(info.identifier);
      if (!el) {
        const textMatch = info.identifier.split('_').pop().replace(/_/g, ' ');
        const found = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,a,button,[role="button"],[role="link"]'))
          .find((e) => e.textContent.trim().toLowerCase().includes(textMatch.toLowerCase()));
        if (!found) return;
        el = found;
      }
      el.setAttribute('data-jarvis-id', info.identifier);
      try {
        addInfoBadge(el, info, info.tag || el.tagName.toLowerCase(), options);
        count++;
      } catch (err) {
        console.error('JARVIS 배지 추가 오류:', err);
      }
    });
    return count;
  };

  // ===== 요약 + 채팅 패널 =====
  const showSummaryPanel = ({
    summary, cached, translated, language,
    onAsk, onAskStream, onClose,
    onExportText, onExportMarkdown,
    onToggleWatch, watchEnabled, onTranslateAgain,
  }) => {
    const existing = document.getElementById('jarvis-summary-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'jarvis-summary-panel';

    const badges = [];
    if (cached) badges.push('<span class="jarvis-cache-badge">⚡ 캐시</span>');
    if (translated) badges.push(`<span class="jarvis-cache-badge" title="${language || ''}">🌐 번역</span>`);

    panel.innerHTML = `
      <div class="jarvis-summary-header">
        <div class="jarvis-summary-icon">
          <svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3"/>
            <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8"/>
          </svg>
        </div>
        <span>JARVIS</span>
        ${badges.join('')}
        <div class="jarvis-header-actions">
          <button class="jarvis-icon-btn" id="jarvis-watch-btn" title="이 페이지 감시 ${watchEnabled ? '해제' : '추가'}">
            ${watchEnabled ? '🔔' : '🔕'}
          </button>
          <button class="jarvis-icon-btn" id="jarvis-export-btn" title="대화 내보내기">⬇</button>
          <button class="jarvis-summary-close" id="jarvis-panel-close" aria-label="닫기">×</button>
        </div>
      </div>
      <div class="jarvis-summary-content" id="jarvis-summary-text">
        <div class="jarvis-message jarvis-message-assistant" data-role="summary">
          <div class="jarvis-message-content">${renderMarkdown(summary)}</div>
        </div>
        <div id="jarvis-compare-box" class="jarvis-compare-box" style="display:none;">
          <div class="jarvis-compare-title">⚖️ 비교 대상</div>
          <ul id="jarvis-compare-list" class="jarvis-compare-list"></ul>
          <div class="jarvis-compare-actions">
            <button class="tiny-btn" id="jarvis-compare-ask">비교 질문 실행</button>
            <button class="tiny-btn" id="jarvis-compare-clear">비우기</button>
          </div>
        </div>
        <div id="jarvis-chat-messages" class="jarvis-chat-messages"></div>
        <div id="jarvis-loading" class="jarvis-loading" style="display:none;">
          <div class="jarvis-loading-spinner"></div>
          <span>JARVIS가 답변을 생성하고 있습니다...</span>
        </div>
      </div>
      <div class="jarvis-chat-input-container">
        <div class="jarvis-resize-handle" id="jarvis-resize-handle" title="드래그하여 크기 조절"></div>
        <div id="jarvis-focus-chip-container" class="jarvis-focus-chip-container"></div>
        <input type="text" id="jarvis-chat-input" class="jarvis-chat-input" placeholder="JARVIS에게 질문하세요...">
        <button id="jarvis-chat-send" class="jarvis-chat-send">전송</button>
      </div>
      <div class="jarvis-menu" id="jarvis-export-menu" style="display:none;">
        <button data-action="text">📄 텍스트로 내보내기</button>
        <button data-action="markdown">📝 마크다운으로 내보내기</button>
        ${translated === false && language ? '<button data-action="translate">🌐 한국어 번역본 보기</button>' : ''}
      </div>
    `;
    document.body.appendChild(panel);

    const chatInput = panel.querySelector('#jarvis-chat-input');
    const chatSend = panel.querySelector('#jarvis-chat-send');
    const chatMessages = panel.querySelector('#jarvis-chat-messages');
    const loading = panel.querySelector('#jarvis-loading');
    const scrollRoot = panel.querySelector('#jarvis-summary-text');
    const focusContainer = panel.querySelector('#jarvis-focus-chip-container');

    let focusedElements = [];
    const compareList = [];

    panel.querySelector('#jarvis-panel-close').addEventListener('click', () => {
      panel.style.opacity = '0';
      panel.style.transform = 'translateX(100%)';
      setTimeout(() => { panel.remove(); if (onClose) onClose(); }, 400);
    });

    const watchBtn = panel.querySelector('#jarvis-watch-btn');
    watchBtn.addEventListener('click', async () => {
      if (onToggleWatch) {
        const next = await onToggleWatch();
        watchBtn.textContent = next ? '🔔' : '🔕';
        watchBtn.title = `이 페이지 감시 ${next ? '해제' : '추가'}`;
      }
    });

    // Export menu
    const exportMenu = panel.querySelector('#jarvis-export-menu');
    panel.querySelector('#jarvis-export-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = exportMenu.style.display === 'block';
      exportMenu.style.display = visible ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
      if (!exportMenu.contains(e.target)) exportMenu.style.display = 'none';
    });
    exportMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      exportMenu.style.display = 'none';
      if (action === 'text' && onExportText) onExportText();
      else if (action === 'markdown' && onExportMarkdown) onExportMarkdown();
      else if (action === 'translate' && onTranslateAgain) onTranslateAgain();
    });

    const appendMessage = (role, content, options = {}) => {
      const msg = document.createElement('div');
      msg.className = `jarvis-message jarvis-message-${role}`;
      const body = document.createElement('div');
      body.className = 'jarvis-message-content';
      if (role === 'user' || role === 'error') {
        body.textContent = content;
      } else {
        body.innerHTML = renderMarkdown(content);
      }
      msg.appendChild(body);
      chatMessages.appendChild(msg);
      setTimeout(() => { scrollRoot.scrollTop = scrollRoot.scrollHeight; }, 50);
      return { msg, body };
    };

    const updateStreamMessage = (body, full) => {
      body.innerHTML = renderMarkdown(full);
      scrollRoot.scrollTop = scrollRoot.scrollHeight;
    };

    const renderFocusChips = () => {
      focusContainer.innerHTML = '';
      focusedElements.forEach((f, idx) => {
        const chip = document.createElement('span');
        chip.className = 'jarvis-focus-chip';
        chip.textContent = `📍 ${f.text.slice(0, 30)}`;
        const rm = document.createElement('button');
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          focusedElements.splice(idx, 1);
          renderFocusChips();
        });
        chip.appendChild(rm);
        focusContainer.appendChild(chip);
      });
    };

    const compareBox = panel.querySelector('#jarvis-compare-box');
    const compareListEl = panel.querySelector('#jarvis-compare-list');
    const renderCompareList = () => {
      compareListEl.innerHTML = '';
      if (compareList.length === 0) {
        compareBox.style.display = 'none';
        return;
      }
      compareBox.style.display = 'block';
      compareList.forEach((item, idx) => {
        const li = document.createElement('li');
        li.textContent = item.text.slice(0, 60);
        const rm = document.createElement('button');
        rm.className = 'tiny-btn';
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          compareList.splice(idx, 1);
          renderCompareList();
        });
        li.appendChild(rm);
        compareListEl.appendChild(li);
      });
    };

    panel.querySelector('#jarvis-compare-clear').addEventListener('click', () => {
      compareList.length = 0;
      renderCompareList();
    });
    panel.querySelector('#jarvis-compare-ask').addEventListener('click', () => {
      if (compareList.length < 2) {
        appendMessage('error', '비교하려면 2개 이상의 요소를 추가하세요.');
        return;
      }
      const names = compareList.map((c, i) => `(${i + 1}) ${c.text.slice(0, 40)}`).join(', ');
      chatInput.value = `다음 요소들을 비교해 주세요: ${names}`;
      focusedElements = [...compareList];
      renderFocusChips();
      sendQuestion();
    });

    const addFocus = (info) => {
      if (!info) return;
      const exists = focusedElements.some((f) => f.identifier === info.identifier);
      if (!exists) focusedElements.push(info);
      renderFocusChips();
      chatInput.focus();
    };

    const addCompare = (info) => {
      if (!info) return;
      if (compareList.some((c) => c.identifier === info.identifier)) return;
      compareList.push(info);
      renderCompareList();
    };

    const sendQuestion = async () => {
      const question = chatInput.value.trim();
      if (!question) return;
      appendMessage('user', question);
      chatInput.value = '';

      const focusSnapshot = [...focusedElements];
      focusedElements = [];
      renderFocusChips();

      loading.style.display = 'flex';
      chatInput.disabled = true;
      chatSend.disabled = true;

      try {
        if (onAskStream) {
          const placeholder = appendMessage('assistant', '');
          loading.style.display = 'none';
          const full = await onAskStream(question, focusSnapshot, (_delta, accumulated) => {
            updateStreamMessage(placeholder.body, accumulated);
          });
          if (full) updateStreamMessage(placeholder.body, full);
        } else if (onAsk) {
          const answer = await onAsk(question, focusSnapshot);
          appendMessage('assistant', answer);
        }
      } catch (err) {
        console.error('JARVIS 채팅 오류:', err);
        appendMessage('error', `오류가 발생했습니다: ${err.message}`);
      } finally {
        loading.style.display = 'none';
        chatInput.disabled = false;
        chatSend.disabled = false;
        chatInput.focus();
      }
    };

    chatSend.addEventListener('click', sendQuestion);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
    });

    attachResize(panel);

    setTimeout(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
      chatInput.focus();
    }, 100);

    return {
      panel,
      appendMessage,
      addFocus,
      addCompare,
      close: () => panel.querySelector('#jarvis-panel-close').click(),
    };
  };

  const attachResize = (panel) => {
    const handle = panel.querySelector('#jarvis-resize-handle');
    if (!handle) return;
    let startX = 0, startY = 0, startW = 0, startH = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;
      const newW = Math.max(320, Math.min(720, startW + dx));
      const newH = Math.max(280, Math.min(window.innerHeight - 40, startH + dy));
      panel.style.width = `${newW}px`;
      panel.style.maxHeight = `${newH}px`;
      panel.style.height = `${newH}px`;
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startW = rect.width; startH = rect.height;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  };

  window.JARVIS = window.JARVIS || {};
  window.JARVIS.Renderer = {
    showActivationIndicator,
    setIndicatorState,
    removeIndicator,
    addInfoBadge,
    applyEnhancedInfo,
    showSummaryPanel,
    escapeHtml,
    renderMarkdown,
    highlightCode,
  };
})();
