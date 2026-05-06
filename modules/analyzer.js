// JARVIS Analyzer Module — Gemini API (structured + streaming) + Hot-Swap + 점진 분석
(() => {
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  // ==== 모델 해석기 (Hot Swap) ====
  // 'auto-3.1' = primary: 3.1 Flash-Lite, fallback: 3 Flash
  // 'auto-3' / 'auto' 는 동일 처리. 명시 모델은 그대로 사용 (fallback 없음).
  const MODEL_PRESETS = {
    'auto-3.1': { primary: 'gemini-3.1-flash-lite-preview', fallback: 'gemini-3-flash-preview' },
    'auto-3': { primary: 'gemini-3-flash-preview', fallback: 'gemini-3.1-flash-lite-preview' },
    'auto': { primary: 'gemini-3.1-flash-lite-preview', fallback: 'gemini-3-flash-preview' },
  };

  const resolveModels = (setting) => {
    if (!setting) return MODEL_PRESETS['auto-3.1'];
    if (MODEL_PRESETS[setting]) return MODEL_PRESETS[setting];
    return { primary: setting, fallback: null };
  };

  const buildUrl = (model, kind, apiKey) => {
    const op = kind === 'stream' ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return `${API_BASE}/${model}:${op}${kind === 'stream' ? '&' : '?'}key=${apiKey}`;
  };

  // ==== 응답 스키마 ====
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

  // ==== 프롬프트 빌더 ====
  const buildPrompt = (pageInfo, elements, options = {}) => {
    const elementsInfo = elements.map((el) => ({
      identifier: el.identifier,
      tag: el.tag,
      text: el.text,
      id: el.id,
      className: el.className,
      href: el.href,
      context: el.context, // 주변 텍스트 (있을 때)
    }));

    const languageInstruction = options.translate
      ? `페이지 언어는 ${options.pageLang || '외국어'}이지만 응답(요약/설명/태그)은 모두 한국어로 번역해서 작성하세요.`
      : '응답은 한국어로 작성하세요.';
    const mode = options.summarize ? '페이지 전체 요약과 함께' : '요소별 설명만';

    return `당신은 JARVIS입니다. 다음 웹페이지 일부를 ${mode} 분석합니다.
${languageInstruction}
- 짧고 정확하게. 각 요소 enhancedInfo는 1~2문장 이내.
- relatedLinks는 절대 추측하지 말고, 입력된 href나 페이지 URL 도메인 내부만 허용.
- tags는 최대 3개, 한국어 명사 위주.

페이지 제목: ${pageInfo.title}
URL: ${pageInfo.url}

분석 대상 요소(JSON):
${JSON.stringify(elementsInfo, null, 2)}

출력은 정의된 JSON 스키마를 정확히 따르세요.`;
  };

  // ==== Fetch 래퍼 ====
  const postJSON = async (apiUrl, body, signal) => {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
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

  const isTokenLimit = (err) => {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    return err.status === 400 && (msg.includes('token') || msg.includes('too long') || msg.includes('input') || msg.includes('context'));
  };
  const isRateLimit = (err) => err && (err.status === 429 || err.status === 503 || err.status === 500);
  const isHotSwappable = (err) => {
    if (!err) return false;
    if (err.status === 404) return true; // 모델 미존재(프리뷰 미공개 등) → 폴백
    if (err.status === 403) return true; // 권한 문제 → 폴백
    if (err.status >= 500) return true;
    if ((err.message || '').includes('JSON 파싱 실패')) return true;
    return false;
  };

  const compressElements = (elements) => elements.map((e) => ({
    ...e,
    text: (e.text || '').slice(0, 80),
    context: (e.context || '').slice(0, 60),
  }));

  // ==== 단일 모델로 한 번 호출 (재시도 포함) ====
  const callOnceWithModel = async ({ model, apiKey, pageInfo, elements, summarize = true, retry = 1, translate = false, pageLang = '', signal }) => {
    let currentElements = elements;
    let lastError = null;

    for (let attempt = 0; attempt <= retry; attempt++) {
      const body = {
        contents: [{ parts: [{ text: buildPrompt(pageInfo, currentElements, { summarize, translate, pageLang }) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          // Lite/Flash 빠른 응답을 위해 토큰 한도 보수적 설정
          maxOutputTokens: summarize ? 1800 : 1200,
          temperature: 0.4,
        },
      };
      try {
        const data = await postJSON(buildUrl(model, 'json', apiKey), body, signal);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return { summary: '', elements: [] };
        const parsed = parseJSONResponse(text);
        return {
          summary: typeof parsed.summary === 'string' ? parsed.summary : '',
          elements: Array.isArray(parsed.elements) ? parsed.elements : [],
          modelUsed: model,
        };
      } catch (err) {
        lastError = err;
        if (attempt >= retry) break;
        if (isTokenLimit(err)) {
          const half = Math.max(1, Math.floor(currentElements.length / 2));
          currentElements = compressElements(currentElements.slice(0, half));
          continue;
        }
        if (isRateLimit(err)) {
          await wait(600 * Math.pow(2, attempt));
          continue;
        }
        await wait(300 * (attempt + 1));
      }
    }
    throw lastError;
  };

  // ==== Hot Swap 래퍼: primary 시도 → 실패면 fallback 1회 ====
  const callWithHotSwap = async ({ models, apiKey, pageInfo, elements, summarize, translate, pageLang, signal }) => {
    try {
      return await callOnceWithModel({ model: models.primary, apiKey, pageInfo, elements, summarize, retry: 1, translate, pageLang, signal });
    } catch (err) {
      if (models.fallback && isHotSwappable(err)) {
        try {
          const out = await callOnceWithModel({ model: models.fallback, apiKey, pageInfo, elements, summarize, retry: 1, translate, pageLang, signal });
          return { ...out, swapped: true };
        } catch (e2) {
          throw e2;
        }
      }
      throw err;
    }
  };

  // ==== 청크 분할: 첫 청크는 작게(빠른 첫 응답) ====
  const splitChunks = (elements, options = {}) => {
    const firstSize = options.firstChunkSize || 5;
    const restSize = options.chunkSize || 10;
    if (elements.length === 0) return [];
    const head = elements.slice(0, firstSize);
    const tail = elements.slice(firstSize);
    const chunks = [head];
    for (let i = 0; i < tail.length; i += restSize) chunks.push(tail.slice(i, i + restSize));
    return chunks;
  };

  // ==== 점진 분석 (Streaming Chunk Pipeline) ====
  // onChunk(chunkResult)가 각 청크 도착 즉시 호출됨.
  // chunkResult = { index, total, completed, summary?, elements, error?, modelUsed, swapped? }
  const analyzePageStream = async (pageInfo, settings, options = {}, onChunk) => {
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');
    const models = resolveModels(settings.geminiModel);

    const chunks = splitChunks(pageInfo.elements, options);
    if (chunks.length === 0) return { summary: '', elements: [], errors: [] };

    let completed = 0;
    const merged = { summary: '', elements: [], errors: [], modelUsed: null, swapped: false };

    const promises = chunks.map((chunk, idx) => {
      const summarize = idx === 0;
      return callWithHotSwap({
        models,
        apiKey,
        pageInfo,
        elements: chunk,
        summarize,
        translate: options.translate === true,
        pageLang: options.pageLang || '',
        signal: options.signal,
      })
        .then((result) => {
          completed++;
          if (summarize && result.summary && !merged.summary) merged.summary = result.summary;
          merged.elements.push(...(result.elements || []));
          if (!merged.modelUsed) merged.modelUsed = result.modelUsed;
          if (result.swapped) merged.swapped = true;
          if (onChunk) {
            onChunk({
              index: idx,
              total: chunks.length,
              completed,
              summary: result.summary || '',
              elements: result.elements || [],
              modelUsed: result.modelUsed,
              swapped: !!result.swapped,
            });
          }
          return result;
        })
        .catch((err) => {
          completed++;
          merged.errors.push(err.message || String(err));
          if (onChunk) {
            onChunk({
              index: idx,
              total: chunks.length,
              completed,
              summary: '',
              elements: [],
              error: err.message || String(err),
            });
          }
          return { summary: '', elements: [], _error: err };
        });
    });

    await Promise.all(promises);
    return merged;
  };

  // ==== 호환 진입점: analyzePage(레거시) ====
  const analyzePage = async (pageInfo, settings, options = {}) => {
    return analyzePageStream(pageInfo, settings, options);
  };

  // ==== 채팅 ====
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
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');
    const models = resolveModels(settings.geminiModel);

    const prompt = buildChatPrompt({ question, summary, pageInfo, history, focus });
    const body = { contents: [{ parts: [{ text: prompt }] }] };

    try {
      const data = await postJSON(buildUrl(models.primary, 'json', apiKey), body);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('응답을 받을 수 없습니다');
      return text;
    } catch (err) {
      if (models.fallback && isHotSwappable(err)) {
        const data = await postJSON(buildUrl(models.fallback, 'json', apiKey), body);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('응답을 받을 수 없습니다');
        return text;
      }
      throw err;
    }
  };

  // Streaming 채팅 — Hot Swap 적용
  const chatStream = async ({ question, summary, pageInfo, history, settings, focus, onDelta, signal }) => {
    const apiKey = settings.apiKey;
    if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');
    const models = resolveModels(settings.geminiModel);

    const prompt = buildChatPrompt({ question, summary, pageInfo, history, focus });
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });

    const tryModel = async (model) => {
      const apiUrl = buildUrl(model, 'stream', apiKey);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const err = new Error(`스트리밍 실패: ${response.status} - ${errText.slice(0, 200)}`);
        err.status = response.status;
        throw err;
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
          const dataStr = line.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;
          try {
            const json = JSON.parse(dataStr);
            const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
            if (text) {
              full += text;
              if (onDelta) onDelta(text, full);
            }
          } catch (_) { /* skip malformed */ }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
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

    try {
      return await tryModel(models.primary);
    } catch (err) {
      if (models.fallback && isHotSwappable(err)) {
        return await tryModel(models.fallback);
      }
      throw err;
    }
  };

  // ==== API 키 검증 ====
  const validateKey = async (apiKey, modelSetting) => {
    if (!apiKey) return { ok: false, error: 'API 키가 비어 있습니다.' };
    const models = resolveModels(modelSetting);
    const tryOne = async (m) => postJSON(buildUrl(m, 'json', apiKey), {
      contents: [{ parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 4 },
    });
    try {
      await tryOne(models.primary);
      return { ok: true, model: models.primary };
    } catch (e) {
      if (models.fallback) {
        try {
          await tryOne(models.fallback);
          return { ok: true, model: models.fallback, swapped: true };
        } catch (e2) {
          return { ok: false, error: e2.message, status: e2.status };
        }
      }
      return { ok: false, error: e.message, status: e.status };
    }
  };

  window.JARVIS = window.JARVIS || {};
  window.JARVIS.Analyzer = {
    analyzePage,
    analyzePageStream,
    chat,
    chatStream,
    validateKey,
    resolveModels,
  };
})();
