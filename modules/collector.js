// JARVIS Collector Module — DOM 요소 수집 + 뷰포트 우선순위
(() => {
  const MAX_ELEMENTS = 50;

  const SELECTORS = [
    'h1, h2, h3, h4, h5, h6',
    'a[href]',
    'button',
    'nav a',
    'main a',
    'article a',
    'section a',
    '[role="button"]',
    '[role="link"]',
  ];

  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return false;
    return true;
  };

  const distanceToViewport = (rect) => {
    const vh = window.innerHeight;
    if (rect.top >= 0 && rect.top <= vh) return 0;
    if (rect.top < 0) return Math.abs(rect.top);
    return rect.top - vh;
  };

  const buildIdentifier = (tag, index, text) => {
    const textHash = text.substring(0, 30).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_가-힣]/g, '');
    return `${tag}_${index}_${textHash}`;
  };

  const collectPageInfo = (options = {}) => {
    const max = options.max || MAX_ELEMENTS;
    const elements = [];
    const elementMap = new Map();
    const seen = new Set();
    const candidates = [];

    SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (!isVisible(el)) return;
        const text = el.textContent.trim();
        if (!text || text.length < 2) return;

        const elementKey = `${el.tagName}_${el.id || ''}_${text.substring(0, 50)}`;
        if (seen.has(elementKey)) return;
        seen.add(elementKey);

        const rect = el.getBoundingClientRect();
        candidates.push({ el, text, rect, distance: distanceToViewport(rect) });
      });
    });

    // 뷰포트 근접 우선, 그다음 상단에서 가까운 순
    candidates.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.rect.top - b.rect.top;
    });

    candidates.slice(0, max).forEach((c, idx) => {
      const { el, text } = c;
      const tag = el.tagName.toLowerCase();
      const identifier = buildIdentifier(tag, idx, text);

      const info = {
        identifier,
        tag,
        text: text.substring(0, 200),
        id: el.id || null,
        className: el.className ? el.className.toString().split(' ').slice(0, 3).join(' ') : null,
        href: el.href || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        inViewport: c.distance === 0,
      };
      elements.push(info);
      elementMap.set(identifier, el);
    });

    return {
      title: document.title,
      url: window.location.href,
      elements,
      elementMap,
      signature: computeSignature(elements),
    };
  };

  // 요소 구성의 시그니처 — 동일 URL 내 주요 변경 감지용
  const computeSignature = (elements) => {
    const str = elements.map((e) => `${e.tag}|${e.id || ''}|${e.text.substring(0, 40)}`).join('\n');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `${elements.length}:${hash}`;
  };

  // 캐시와 비교해서 추가된 요소만 반환
  const diffAgainst = (pageInfo, cachedElements) => {
    const cachedKeys = new Set(
      (cachedElements || []).map((e) => `${e.tag}|${e.text.substring(0, 40)}`)
    );
    const added = pageInfo.elements.filter(
      (e) => !cachedKeys.has(`${e.tag}|${e.text.substring(0, 40)}`)
    );
    return added;
  };

  const detectLanguage = () => {
    const langAttr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const metaLang = (document.querySelector('meta[http-equiv="content-language"]')?.content || '').toLowerCase();
    const lang = langAttr || metaLang || '';
    const primary = lang.split('-')[0] || '';
    const isKorean = primary === 'ko';

    // 보정: lang 태그가 없으면 텍스트 샘플로 간단 감지
    if (!primary) {
      const sample = (document.body?.innerText || '').slice(0, 1500);
      const korean = (sample.match(/[가-힣]/g) || []).length;
      const cjk = (sample.match(/[一-龥]/g) || []).length;
      const latin = (sample.match(/[A-Za-z]/g) || []).length;
      if (korean > latin / 3 && korean > cjk) return { lang: 'ko', primary: 'ko', isKorean: true };
      if (cjk > latin / 3 && cjk > korean) return { lang: 'zh', primary: 'zh', isKorean: false };
      if (latin > 50) return { lang: 'en', primary: 'en', isKorean: false };
      return { lang: '', primary: '', isKorean: true };
    }
    return { lang, primary, isKorean };
  };

  const extractPageText = (maxChars = 10000) => {
    const clone = document.body?.cloneNode(true);
    if (!clone) return '';
    clone.querySelectorAll('script, style, noscript, iframe').forEach((el) => el.remove());
    return (clone.innerText || '').replace(/\s+/g, ' ').slice(0, maxChars);
  };

  window.JARVIS = window.JARVIS || {};
  window.JARVIS.Collector = {
    collectPageInfo,
    computeSignature,
    diffAgainst,
    isVisible,
    detectLanguage,
    extractPageText,
  };
})();
