// JARVIS Analyzer Module — Gemini API (structured + streaming) + 에러 복구 + 번역
(() => {
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const responseSchema = {
    type: 'object',
    properties: {
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: '요소 식별자' },
            enhancedInfo: { type: 'string', description: '요소에 대한 부가 설명' },
            relatedLinks: { type: 'array', items: { type: 'string' }, description: '관련 링크 URL 목록' },
            tags: { type: 'array', items: { type: 'string' }, description: '태그 목록' },
          },
          required: ['identifier'],
        },
      },
      summary: { type: 'string', description: '페이지 전체 요약' },
    },
    required: ['elements', 'summary'],
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const buildPrompt = (pageInfo, elements, options = {}) => {
    const elementsInfo = elements.map((el) => ({
      identifier: el.identifier,
      tag: el.tag,
      text: el.text,
      id: el.id,
      className: el.className,
      href: el.href,
    }));

    const languageInstruction = options.translate
      ? `페이지 언어는 ${options.pageLang || '외국어'}이지만 응답(요약/설명/태그)은 모두 한국어로 번역해서 작성하세요.`
      : '응답은 한국어로 작성하세요.';
    const mode = options.summarize ? '페이지 전체 요약과 함께' : '요소별 설명을 중심으로';

    return `당신은 JARVIS입니다. 다음 웹페이지를 ${mode} 분석해주세요.
${languageInstruction}

페이지 제목: ${pageInfo.title}
URL: ${pageInfo.url}

주요 요소들(identifier로 식별):
${JSON.stringify(elementsInfo, null, 2)}

각 요소에 대해 맥락에 맞는 부가 설명, 관련 링크(있다면), 간결한 태그를 제공하세요.
응답은 정의된 JSON 스키마를 정확히 따르세요.`;
  };

  const postJSON = async (apiUrl, body) => {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || '알 수 없는 오류';
      const err = new Error(`API 호출 실패: ${response.status} - ${message}`);
      err.status = response.status;
      err.body = errorData;
      throw err;
    }
    return response.json();
  };

  const parseJSONResponse = (text) => {
    let cleaned = (text || '').trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('JSON 파싱 실패');
    }
  };

  const chunkArray = (arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
  };

  // 토큰 초과로 판단되는 오류인지
  const isTokenLimit = (err) => {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    return err.status === 400 && (msg.includes('token') || msg.includes('too long') || msg.includes('input') || msg.includes('context'));
  };
  const isRateLimit = (err) => err && (err.status === 429 || err.status === 503);

  // 텍스트 압축(요약을 압축하려는 경우 요소 텍스트 길이 줄이기)
  const compressElements = (elements) => elements.map((e) => ({ ...e, text: (e.text || '').slice(0, 80) }));

  const callOnce = async ({ apiUrl, pageInfo, elements, summarize = true, retry = 2, translate = false, pageLang = '' }) => {
    let currentElements = elements;
    let lastError = null;

    for (let attempt = 0; attempt <= retry; attempt++) {
      const body = {
        contents: [{ parts: [{ text: buildPrompt(pageInfo, currentElements, { summarize, translate, pageLang }) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
        },
      };
      try {
        const data = await postJSON(apiUrl, body);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return { summary: '', elements: [] };
        const parsed = parseJSONResponse(text);
        return {
          summary: typeof parsed.summary === 'string' ? parsed.summary : '',
          elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        };
      } catch (err) {
        lastError = err;
        if (attempt >= retry) break;

        if (isTokenLimit(err)) {
          // 요소를 절반으로 축소 + 텍스트 압축
          const half = Math.max(1, Math.floor(currentElements.length / 2));
          currentElements = compressElements(currentElements.slice(0, half));
          continue;
        }
        if (isRateLimit(err)) {
          await wait(800 * Math.pow(2, attempt)); // 지수 백오프
          continue;
        }
        // 일반 오류 — 짧게 대기 후 재시도
        await wait(400 * (attempt + 1));
      }
    }
    throw lastError;
  };

  const analyzePage = async (pageInfo, settings, options = {}) => {
    const model = settings.geminiModel || 'gemini-2.5-flash';
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');

    const apiUrl = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
    const chunkSize = options.chunkSize || 12;
    const chunks = chunkArray(pageInfo.elements, chunkSize);

    if (chunks.length === 0) return { summary: '', elements: [] };

    const calls = chunks.map((chunk, idx) =>
      callOnce({
        apiUrl,
        pageInfo,
        elements: chunk,
        summarize: idx === 0,
        retry: 2,
        translate: options.translate === true,
        pageLang: options.pageLang || '',
      }).catch((err) => {
        console.error('JARVIS chunk 실패:', err);
        return { summary: '', elements: [], _error: err };
      })
    );

    const results = await Promise.all(calls);
    const merged = {
      summary: results[0]?.summary || '',
      elements: [],
      errors: results.filter((r) => r._error).map((r) => r._error.message),
    };
    results.forEach((r) => merged.elements.push(...(r.elements || [])));
    return merged;
  };

  const buildChatPrompt = ({ question, summary, pageInfo, history, focus }) => {
    const historyText = (history || [])
      .slice(-6)
      .map((msg) => `${msg.role === 'user' ? '사용자' : 'JARVIS'}: ${msg.content}`)
      .join('\n');

    const focusBlock = focus
      ? `\n사용자가 지정한 요소(들):\n${JSON.stringify(focus, null, 2)}\n`
      : '';

    return `당신은 JARVIS입니다. 사용자가 보고 있는 웹페이지 맥락으로 질문에 답변하세요.

페이지 제목: ${pageInfo.title}
페이지 URL: ${pageInfo.url}

페이지 요약:
${summary || '(요약 없음)'}
${focusBlock}
이전 대화:
${historyText || '(없음)'}

사용자 질문: ${question}

한국어로 간결하고 정확하게 답하고, 필요하면 단계/목록/코드블록(마크다운)을 사용하세요.`;
  };

  const chat = async ({ question, summary, pageInfo, history, settings, focus }) => {
    const model = settings.geminiModel || 'gemini-2.5-flash';
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');
    const apiUrl = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

    const prompt = buildChatPrompt({ question, summary, pageInfo, history, focus });
    const data = await postJSON(apiUrl, { contents: [{ parts: [{ text: prompt }] }] });
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('응답을 받을 수 없습니다');
    return text;
  };

  // Streaming 채팅 — SSE 유사 스트림(streamGenerateContent ?alt=sse) 사용
  const chatStream = async ({ question, summary, pageInfo, history, settings, focus, onDelta, signal }) => {
    const model = settings.geminiModel || 'gemini-2.5-flash';
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');

    const apiUrl = `${API_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const prompt = buildChatPrompt({ question, summary, pageInfo, history, focus });
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`스트리밍 실패: ${response.status} - ${errText.slice(0, 200)}`);
    }
    if (!response.body) throw new Error('스트림을 읽을 수 없습니다');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';

    const handleEvent = (rawEvent) => {
      const lines = rawEvent.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
          if (text) {
            full += text;
            if (onDelta) onDelta(text, full);
          }
        } catch (_) {
          // 일부 조각이 손상되었을 수 있으니 무시
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 이벤트는 빈 줄로 구분
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleEvent(event);
      }
    }
    if (buffer.trim()) handleEvent(buffer);
    return full;
  };

  // API 키 검증
  const validateKey = async (apiKey, model = 'gemini-2.5-flash') => {
    if (!apiKey) return { ok: false, error: 'API 키가 비어 있습니다.' };
    try {
      const apiUrl = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
      const data = await postJSON(apiUrl, {
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 4 },
      });
      const ok = !!data?.candidates?.[0];
      return { ok, model };
    } catch (e) {
      return { ok: false, error: e.message, status: e.status };
    }
  };

  window.JARVIS = window.JARVIS || {};
  window.JARVIS.Analyzer = { analyzePage, chat, chatStream, validateKey };
})();
