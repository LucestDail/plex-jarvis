// 콘텐츠 스크립트 - 화면 분석 및 정보 표시

let jarvisActivated = false;
let jarvisOverlay = null;

// JARVIS 활성화 확인
const checkActivation = async () => {
  if (jarvisActivated) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'checkActivation' });
    
    if (response && response.shouldActivate && response.timerStarted) {
      // 5초 타이머가 시작되었음을 사용자에게 알림
      showActivationIndicator();
    }
  } catch (error) {
    console.error('JARVIS activation check failed:', error);
  }
};

// 활성화 인디케이터 표시
const showActivationIndicator = () => {
  // 이미 인디케이터가 있으면 제거
  const existing = document.getElementById('jarvis-activation-indicator');
  if (existing) {
    existing.remove();
  }

  const indicator = document.createElement('div');
  indicator.id = 'jarvis-activation-indicator';
  indicator.innerHTML = `
    <div class="jarvis-indicator-content">
      <div class="jarvis-indicator-icon">
        <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3"/>
          <circle cx="50" cy="50" r="30" fill="none" stroke="#00d4ff" stroke-width="2" opacity="0.6"/>
          <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </div>
      <span class="jarvis-indicator-text">JARVIS 활성화 대기 중...</span>
    </div>
  `;
  document.body.appendChild(indicator);
  
  // 인디케이터는 activateJarvis에서 관리하므로 여기서는 제거하지 않음
};

// JARVIS 활성화 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'activateJarvis') {
    if (!jarvisActivated) {
      activateJarvis();
      jarvisActivated = true;
      chrome.runtime.sendMessage({ type: 'jarvisActivated' });
    }
    sendResponse({ success: true });
  }
});

// JARVIS 활성화
const activateJarvis = async () => {
  // 활성화 인디케이터를 로딩 상태로 전환
  const indicator = document.getElementById('jarvis-activation-indicator');
  if (indicator) {
    indicator.innerHTML = `
      <div class="jarvis-indicator-content">
        <div class="jarvis-indicator-icon">
          <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3" stroke-dasharray="70 30" stroke-dashoffset="0">
              <animate attributeName="stroke-dashoffset" values="0;100" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8">
              <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
        <span class="jarvis-indicator-text">JARVIS 정보 분석 중...</span>
      </div>
    `;
  }

  // 설정 가져오기
  const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);
  
  if (!settings.apiKey) {
    console.error('JARVIS: API 키가 설정되지 않았습니다.');
    if (indicator) {
      indicator.innerHTML = `
        <div class="jarvis-indicator-content">
          <span class="jarvis-indicator-text" style="color: #ff4444;">⚠️ API 키가 설정되지 않았습니다</span>
        </div>
      `;
      setTimeout(() => indicator.remove(), 3000);
    }
    return;
  }

  try {
    // 화면 정보 수집
    const pageInfo = collectPageInfo();
    
    // AI API 호출
    const enhancedInfo = await callGeminiAPI(pageInfo, settings);
    
    // 인디케이터를 성공 상태로 전환
    if (indicator) {
      indicator.innerHTML = `
        <div class="jarvis-indicator-content">
          <div class="jarvis-indicator-icon">✓</div>
          <span class="jarvis-indicator-text">JARVIS 준비 완료</span>
        </div>
      `;
      indicator.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.95) 0%, rgba(0, 200, 0, 0.95) 100%)';
      
      // 1초 후 부드럽게 제거
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.style.opacity = '0';
          indicator.style.transform = 'translateX(100%)';
          setTimeout(() => indicator.remove(), 300);
        }
      }, 1000);
    }
    
    // 화면에 정보 표시
    if (enhancedInfo) {
      displayEnhancedInfo(enhancedInfo);
    } else {
      // 정보가 없을 경우에도 인디케이터 제거
      if (indicator) {
        indicator.innerHTML = `
          <div class="jarvis-indicator-content">
            <span class="jarvis-indicator-text">정보를 가져올 수 없습니다</span>
          </div>
        `;
        setTimeout(() => {
          if (indicator.parentNode) {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 300);
          }
        }, 2000);
      }
    }
  } catch (error) {
    console.error('JARVIS 활성화 오류:', error);
    if (indicator) {
      indicator.innerHTML = `
        <div class="jarvis-indicator-content">
          <span class="jarvis-indicator-text" style="color: #ff4444;">⚠️ 오류 발생</span>
        </div>
      `;
      indicator.style.background = 'linear-gradient(135deg, rgba(255, 68, 68, 0.95) 0%, rgba(200, 0, 0, 0.95) 100%)';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.style.opacity = '0';
          setTimeout(() => indicator.remove(), 300);
        }
      }, 3000);
    }
  }
};

// 페이지 정보 수집 - 실제 HTML 구조 포함
const collectPageInfo = () => {
  const elements = [];
  const elementMap = new Map(); // 요소 식별을 위한 맵
  const seenElements = new Set(); // 중복 방지

  // 주요 요소 수집 (제목, 링크, 버튼, 중요한 텍스트 등)
  const selectors = [
    'h1, h2, h3, h4, h5, h6',
    'a[href]',
    'button',
    'nav a',
    'main a',
    'article a',
    'section a',
    '[role="button"]',
    '[role="link"]'
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el) => {
      if (elements.length >= 50) return; // 최대 50개 요소
      
      const text = el.textContent.trim();
      if (!text || text.length < 2) return; // 너무 짧은 텍스트 제외
      
      // 중복 체크 (같은 요소는 한 번만)
      const elementKey = `${el.tagName}_${el.id || ''}_${text.substring(0, 50)}`;
      if (seenElements.has(elementKey)) return;
      seenElements.add(elementKey);
      
      // 요소 식별자 생성 (고유하게)
      const textHash = text.substring(0, 30).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_가-힣]/g, '');
      const identifier = `${el.tagName.toLowerCase()}_${elements.length}_${textHash}`;
      
      const elementInfo = {
        identifier: identifier,
        tag: el.tagName.toLowerCase(),
        text: text.substring(0, 200), // 최대 200자
        id: el.id || null,
        className: el.className ? el.className.toString().split(' ').slice(0, 3).join(' ') : null,
        href: el.href || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null
      };

      elements.push(elementInfo);
      elementMap.set(identifier, el); // 원본 요소 저장
    });
  });

  return {
    title: document.title,
    url: window.location.href,
    elements: elements,
    elementMap: elementMap // 원본 요소 참조
  };
};

// Gemini API 호출 - 구조화된 출력 사용
const callGeminiAPI = async (pageInfo, settings) => {
  const model = settings.geminiModel || 'gemini-2.5-flash';
  const apiKey = settings.apiKey;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 요소 정보를 간결하게 정리
  const elementsInfo = pageInfo.elements.map(el => ({
    identifier: el.identifier,
    tag: el.tag,
    text: el.text,
    id: el.id,
    className: el.className ? el.className.split(' ').slice(0, 3).join(' ') : null,
    href: el.href
  }));

  const prompt = `다음 웹페이지의 요소들을 분석하여 각 요소에 대한 증강 정보를 제공해주세요.

페이지 제목: ${pageInfo.title}
URL: ${pageInfo.url}

주요 요소들:
${JSON.stringify(elementsInfo, null, 2)}

위 요소들을 분석하여 각 요소에 대한 부가 정보, 관련 링크, 설명을 제공해주세요.
각 요소는 identifier로 식별됩니다.`;

  // 구조화된 출력을 위한 스키마 정의
  const responseSchema = {
    type: "object",
    properties: {
      elements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "요소 식별자"
            },
            enhancedInfo: {
              type: "string",
              description: "요소에 대한 부가 설명"
            },
            relatedLinks: {
              type: "array",
              items: {
                type: "string"
              },
              description: "관련 링크 URL 목록"
            },
            tags: {
              type: "array",
              items: {
                type: "string"
              },
              description: "태그 목록"
            }
          },
          required: ["identifier"]
        }
      },
      summary: {
        type: "string",
        description: "페이지 전체 요약"
      }
    },
    required: ["elements", "summary"]
  };

  try {
    // 구조화된 출력 시도 (Gemini 1.5 Pro 이상 지원)
    let requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('JARVIS API 호출 실패:', response.status, errorData);
      throw new Error(`API 호출 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      
      try {
        // 구조화된 출력이므로 직접 JSON 파싱 시도
        let jsonData;
        let cleanedText = text.trim();
        
        // 마크다운 코드 블록 제거
        cleanedText = cleanedText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        
        try {
          // 직접 파싱 시도
          jsonData = JSON.parse(cleanedText);
        } catch (directParseError) {
          // 직접 파싱 실패 시 JSON 객체 추출
          const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('JSON을 찾을 수 없습니다');
          }
        }
        
        // 응답 구조 검증 및 정규화
        if (!jsonData.elements || !Array.isArray(jsonData.elements)) {
          jsonData.elements = [];
        }
        
        if (!jsonData.summary || typeof jsonData.summary !== 'string') {
          jsonData.summary = '';
        }
        
        return {
          ...jsonData,
          elementMap: pageInfo.elementMap // 원본 요소 맵 추가
        };
      } catch (parseError) {
        console.error('JARVIS JSON 파싱 오류:', parseError);
        console.error('응답 텍스트 (처음 500자):', text.substring(0, 500));
        
        // 파싱 실패 시 빈 구조 반환
        return {
          summary: '정보를 파싱할 수 없습니다.',
          elements: [],
          elementMap: pageInfo.elementMap
        };
      }
    }
    
    return {
      summary: '',
      elements: [],
      elementMap: pageInfo.elementMap
    };
  } catch (error) {
    console.error('JARVIS API 호출 오류:', error);
    throw error;
  }
};

// 향상된 정보 표시 - identifier 기반 매칭
const displayEnhancedInfo = (enhancedInfo) => {
  if (!enhancedInfo || !enhancedInfo.elements) {
    console.warn('JARVIS: 증강 정보가 없습니다.');
    return;
  }

  // 오버레이 생성
  jarvisOverlay = document.createElement('div');
  jarvisOverlay.id = 'jarvis-overlay';
  document.body.appendChild(jarvisOverlay);

  const elementMap = enhancedInfo.elementMap || new Map();
  let enhancedCount = 0;

  // 각 요소에 정보 추가
  enhancedInfo.elements.forEach((elementInfo) => {
    if (!elementInfo.identifier || !elementInfo.enhancedInfo) {
      return; // 필수 정보가 없으면 스킵
    }

    // identifier로 원본 요소 찾기
    const element = elementMap.get(elementInfo.identifier);
    
    if (!element) {
      // 맵에서 찾지 못하면 텍스트로 재검색
      const textMatch = elementInfo.identifier.split('_').pop().replace(/_/g, ' ');
      const foundElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const elText = el.textContent.trim().substring(0, 30);
        return elText && elText.toLowerCase().includes(textMatch.toLowerCase());
      });
      
      if (foundElements.length > 0) {
        foundElements[0].setAttribute('data-jarvis-id', elementInfo.identifier);
        addInfoBadge(foundElements[0], elementInfo, elementInfo.tag || 'element');
        enhancedCount++;
      }
      return;
    }

    // 요소에 식별자 마킹
    element.setAttribute('data-jarvis-id', elementInfo.identifier);
    
    try {
      addInfoBadge(element, elementInfo, elementInfo.tag || element.tagName.toLowerCase());
      enhancedCount++;
    } catch (error) {
      console.error('JARVIS: 배지 추가 오류:', error, elementInfo);
    }
  });

  console.log(`JARVIS: ${enhancedCount}개 요소에 증강 정보 추가됨`);

  // 요약 표시
  if (enhancedInfo.summary) {
    showSummary(enhancedInfo.summary);
  }
};

// 정보 배지 추가 - 아이콘 표시 방식으로 변경
const addInfoBadge = (element, info, type) => {
  // 기존 아이콘과 배지가 있으면 제거
  const existingIcon = element.querySelector('.jarvis-icon');
  if (existingIcon) {
    existingIcon.remove();
  }
  const existingBadge = document.querySelector(`.jarvis-badge[data-element-id="${element.getAttribute('data-jarvis-id')}"]`);
  if (existingBadge) {
    existingBadge.remove();
  }

  // 요소에 relative 위치 설정
  const computedStyle = window.getComputedStyle(element);
  if (computedStyle.position === 'static') {
    element.style.position = 'relative';
  }

  // JARVIS 아이콘 생성
  const icon = document.createElement('div');
  icon.className = 'jarvis-icon';
  icon.setAttribute('data-element-id', element.getAttribute('data-jarvis-id'));
  icon.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke="#00d4ff" stroke-width="2" opacity="0.6"/>
      <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8"/>
    </svg>
  `;
  
  // 아이콘을 요소 내부 우측 상단에 배치
  element.appendChild(icon);

  // 정보 배지 생성
  const badge = document.createElement('div');
  badge.className = 'jarvis-badge';
  badge.setAttribute('data-type', type);
  badge.setAttribute('data-element-id', element.getAttribute('data-jarvis-id'));
  
  // XSS 방지를 위해 DOM API를 사용하여 안전하게 요소 생성
  if (info.enhancedInfo) {
    const infoDiv = document.createElement('div');
    infoDiv.className = 'jarvis-badge-info';
    infoDiv.textContent = info.enhancedInfo;
    badge.appendChild(infoDiv);
  }
  
  if (info.relatedLinks && info.relatedLinks.length > 0) {
    const linksDiv = document.createElement('div');
    linksDiv.className = 'jarvis-badge-links';
    info.relatedLinks.slice(0, 3).forEach(linkUrl => {
      const link = document.createElement('a');
      link.href = linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'jarvis-badge-link';
      link.textContent = '🔗 관련 링크';
      linksDiv.appendChild(link);
    });
    badge.appendChild(linksDiv);
  }
  
  if (info.tags && info.tags.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'jarvis-badge-tags';
    info.tags.slice(0, 3).forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'jarvis-badge-tag';
      tagSpan.textContent = tag;
      tagsDiv.appendChild(tagSpan);
    });
    badge.appendChild(tagsDiv);
  }

  // 배지를 body에 추가 (fixed 위치)
  document.body.appendChild(badge);

  // 아이콘 호버 시 배지 표시
  let badgeTimeout;
  icon.addEventListener('mouseenter', () => {
    clearTimeout(badgeTimeout);
    const rect = icon.getBoundingClientRect();
    badge.style.display = 'block';
    badge.style.top = `${rect.bottom + 8}px`;
    badge.style.left = `${rect.left}px`;
    badge.style.opacity = '1';
    badge.style.transform = 'translateY(0)';
  });

  icon.addEventListener('mouseleave', () => {
    badgeTimeout = setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        badge.style.display = 'none';
      }, 300);
    }, 100);
  });

  // 배지 호버 시 유지
  badge.addEventListener('mouseenter', () => {
    clearTimeout(badgeTimeout);
    badge.style.opacity = '1';
    badge.style.transform = 'translateY(0)';
  });

  badge.addEventListener('mouseleave', () => {
    badge.style.opacity = '0';
    badge.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      badge.style.display = 'none';
    }, 300);
  });

  // 초기 상태
  badge.style.display = 'none';
  badge.style.opacity = '0';
  badge.style.transform = 'translateY(-10px)';
  setTimeout(() => {
    badge.style.transition = 'all 0.3s ease';
  }, 100);
};

// 요약 표시 - 채팅 기능 포함
const showSummary = (summary) => {
  // 기존 패널이 있으면 제거
  const existingPanel = document.getElementById('jarvis-summary-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  const summaryPanel = document.createElement('div');
  summaryPanel.id = 'jarvis-summary-panel';
  
  // 채팅 메시지 저장소
  const chatMessages = [];
  
  // 초기 HTML
  summaryPanel.innerHTML = `
    <div class="jarvis-summary-header">
      <div class="jarvis-summary-icon">
        <svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" stroke-width="3"/>
          <circle cx="50" cy="50" r="15" fill="#00d4ff" opacity="0.8"/>
        </svg>
      </div>
      <span>JARVIS</span>
      <button class="jarvis-summary-close" id="jarvis-panel-close">×</button>
    </div>
    <div class="jarvis-summary-content" id="jarvis-summary-text">
      <div class="jarvis-message jarvis-message-assistant">
        <div class="jarvis-message-content">${escapeHtml(summary)}</div>
      </div>
      <div id="jarvis-chat-messages" class="jarvis-chat-messages"></div>
      <div id="jarvis-loading" class="jarvis-loading" style="display: none;">
        <div class="jarvis-loading-spinner"></div>
        <span>JARVIS가 답변을 생성하고 있습니다...</span>
      </div>
    </div>
    <div class="jarvis-chat-input-container">
      <input type="text" id="jarvis-chat-input" class="jarvis-chat-input" placeholder="JARVIS에게 질문하세요...">
      <button id="jarvis-chat-send" class="jarvis-chat-send">전송</button>
    </div>
  `;
  
  document.body.appendChild(summaryPanel);

  // 닫기 버튼 이벤트
  const closeBtn = summaryPanel.querySelector('#jarvis-panel-close');
  closeBtn.addEventListener('click', () => {
    summaryPanel.style.opacity = '0';
    summaryPanel.style.transform = 'translateX(100%)';
    setTimeout(() => {
      summaryPanel.remove();
    }, 400);
  });

  // 채팅 입력 처리
  const chatInput = summaryPanel.querySelector('#jarvis-chat-input');
  const chatSend = summaryPanel.querySelector('#jarvis-chat-send');
  const chatMessagesContainer = summaryPanel.querySelector('#jarvis-chat-messages');
  const loadingIndicator = summaryPanel.querySelector('#jarvis-loading');

  const sendMessage = async () => {
    const question = chatInput.value.trim();
    if (!question) return;

    // 사용자 메시지 표시
    const userMessage = document.createElement('div');
    userMessage.className = 'jarvis-message jarvis-message-user';
    userMessage.innerHTML = `<div class="jarvis-message-content">${escapeHtml(question)}</div>`;
    chatMessagesContainer.appendChild(userMessage);
    chatMessages.push({ role: 'user', content: question });

    // 입력 필드 초기화
    chatInput.value = '';
    
    // 스크롤을 부모 컨테이너로
    const summaryContent = summaryPanel.querySelector('#jarvis-summary-text');
    setTimeout(() => {
      summaryContent.scrollTop = summaryContent.scrollHeight;
    }, 100);

    // 로딩 표시
    loadingIndicator.style.display = 'flex';
    chatInput.disabled = true;
    chatSend.disabled = true;

    try {
      // AI 응답 생성
      const response = await generateChatResponse(question, summary, chatMessages);
      
      // AI 메시지 표시
      const assistantMessage = document.createElement('div');
      assistantMessage.className = 'jarvis-message jarvis-message-assistant';
      assistantMessage.innerHTML = `<div class="jarvis-message-content">${escapeHtml(response)}</div>`;
      chatMessagesContainer.appendChild(assistantMessage);
      chatMessages.push({ role: 'assistant', content: response });

      // 스크롤
      const summaryContent = summaryPanel.querySelector('#jarvis-summary-text');
      setTimeout(() => {
        summaryContent.scrollTop = summaryContent.scrollHeight;
      }, 100);
    } catch (error) {
      console.error('JARVIS 채팅 오류:', error);
      const errorMessage = document.createElement('div');
      errorMessage.className = 'jarvis-message jarvis-message-error';
      errorMessage.innerHTML = `<div class="jarvis-message-content">오류가 발생했습니다: ${escapeHtml(error.message)}</div>`;
      chatMessagesContainer.appendChild(errorMessage);
    } finally {
      loadingIndicator.style.display = 'none';
      chatInput.disabled = false;
      chatSend.disabled = false;
      chatInput.focus();
    }
  };

  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 애니메이션
  setTimeout(() => {
    summaryPanel.style.opacity = '1';
    summaryPanel.style.transform = 'translateX(0)';
    chatInput.focus();
  }, 100);
};

// HTML 이스케이프 함수
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// 채팅 응답 생성
const generateChatResponse = async (question, summary, chatHistory) => {
  const settings = await chrome.storage.local.get(['apiKey', 'geminiModel']);
  const model = settings.geminiModel || 'gemini-2.5-flash';
  const apiKey = settings.apiKey;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 페이지 정보 수집
  const pageInfo = {
    title: document.title,
    url: window.location.href,
    html: document.body.innerHTML.substring(0, 15000) // 처음 15000자
  };

  // 대화 히스토리 구성
  const historyText = chatHistory.slice(-5).map(msg => 
    `${msg.role === 'user' ? '사용자' : 'JARVIS'}: ${msg.content}`
  ).join('\n');

  const prompt = `당신은 JARVIS입니다. 사용자가 현재 보고 있는 웹페이지에 대해 질문하고 있습니다.

페이지 제목: ${pageInfo.title}
페이지 URL: ${pageInfo.url}

페이지 요약:
${summary}

페이지 HTML 구조 (일부):
${pageInfo.html.substring(0, 5000)}

이전 대화:
${historyText}

사용자 질문: ${question}

위 정보를 바탕으로 사용자의 질문에 친절하고 정확하게 답변해주세요. 페이지의 내용과 구조를 참고하여 답변하되, 간결하고 명확하게 작성해주세요.`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`API 호출 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
  }

  const data = await response.json();
  
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts[0].text;
  }
  
  throw new Error('응답을 받을 수 없습니다');
};

// 페이지 로드 완료 후 활성화 확인
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkActivation, 1000);
  });
} else {
  setTimeout(checkActivation, 1000);
}

