# plex-jarvis — 상세 구현 계획

## 1. 프로젝트 비전

Chrome 확장을 넘어 **로컬에서 작동하는 브라우저 탐지 및 화면 분석 어시스턴트**로 진화. 이미 접속된 URL에 대한 캐싱을 통한 빠른 안내, 개선된 채팅 화면, 누구든 어떤 정보든 이해할 수 있게 해주는 웹 상의 어시스턴트.

## 2. 현재 상태

- Chrome Extension MV3 기반 완성된 프로토타입
- Vanilla JS 단일 파일 구조 (`content.js`에 수집/분석/UI/채팅 집중)
- Gemini API 단일 호출로 최대 50개 요소 분석
- 5초 타이머 기반 자동 활성화
- 기본적인 채팅 기능 (우측 하단 패널)

## 3. 디자인 시스템

**기존 디자인 유지** — Chrome Extension 콘텐츠 스크립트 UI

현재 `content.css` 기반:
- JARVIS 스타일 다크 글래스 오버레이
- 그라데이션 배지, 호버 애니메이션
- 우측 하단 요약/채팅 패널
- 기존 톤과 패턴을 유지하되 UX만 개선

---

## 4. 단계별 구현 계획

### Phase 1 — 구조 개선 + 캐싱 (3주)

**1.1 모듈 분리**
- [x] `content.js` 해체 → 4개 모듈로 분리:
  - [x] `modules/collector.js` — DOM 요소 수집, 뷰포트 우선순위
  - [x] `modules/analyzer.js` — Gemini API 호출(청크 분할 병렬), 응답 파싱
  - [x] `modules/renderer.js` — 배지, 패널, 채팅 UI 렌더링(마크다운/리사이즈 포함)
  - [x] `modules/cache.js` — URL별 캐시 클라이언트 (background로 메시지 전달)
- [x] IIFE + `window.JARVIS` 네임스페이스로 모듈 간 통신

**1.2 URL 기반 캐싱**
- [x] IndexedDB에 URL → 분석 결과 저장 (`background/cache.js`, 확장 origin 단일 DB)
- [x] 캐시 히트 시 즉시 표시 (API 호출 생략)
- [x] 캐시 만료 정책 (기본 24시간, 팝업에서 시간 단위로 설정)
- [x] 페이지 변경 감지 — `MutationObserver` 기반 시그니처 비교 → 추가 요소만 증분 분석
- [x] 캐시 상태 표시 — 요약 패널에 "⚡ 캐시" 배지
- [x] 팝업에서 캐시 관리 — 전체/URL별 삭제, 현재 탭 재분석, 저장 목록 보기

**1.3 성능 최적화**
- [x] 뷰포트 기반 우선 분석 — `getBoundingClientRect` 거리 순 정렬로 화면 내/근접 요소 우선 처리
- [x] 청크 분할 병렬 요청 — 12개 단위 `Promise.all` 병렬 호출 + 청크 단위 재시도
- [x] 응답 스트리밍 — `streamGenerateContent?alt=sse` 도입, 채팅 답변 실시간 렌더링 + 실패 시 단일 응답 폴백
- [x] 5초 고정 타이머 → `requestIdleCallback` + `load` 이벤트 + 설정 가능한 지연으로 변경

### Phase 2 — 채팅 UI 개선 (3주)

**2.1 채팅 패널 재설계**
- [x] 리사이즈 가능한 사이드 패널 (드래그로 크기 조절)
- [x] 마크다운 렌더링 + 간이 구문 강조(키워드/문자열/주석/숫자) + 언어 라벨
- [x] 이미지/링크 프리뷰 — 이미지 URL 자동 인라인, 일반 링크에 favicon + host 배지
- [x] 대화 이력 URL별 로컬 저장 (IndexedDB)
- [x] 대화 내보내기 — 텍스트 / 마크다운 다운로드

**2.2 심화 질의**
- [x] 맥락 유지 대화 — 페이지 요약 + 최근 6턴 히스토리 + 포커스 요소 포함
- [x] 요소 지정 질의 — 배지의 "💬 이것에 대해 질문" 버튼 → 포커스 칩으로 누적
- [x] 비교 질의 — 배지의 "⚖️ 비교에 추가" 버튼 → 2개 이상 선택 시 비교 프롬프트 자동 생성
- [x] 다국어 지원 — 외국어 페이지 자동 감지(`html[lang]`+텍스트 샘플) → 한국어 요약 옵션 (기본 활성)

**2.3 에러 핸들링 강화**
- [x] API 호출 실패 시 지수 백오프 재시도 + 체크박스별 청크 독립 실패 처리
- [x] 네트워크 오류 시 캐시된 결과로 폴백 표시
- [x] 토큰 초과(400) 시 자동 요소 수 절반 축소 + 텍스트 압축 후 재요청
- [x] API 키 미설정/만료 시 명확한 안내 + 팝업에 "API 키 테스트" 버튼

### Phase 3 — 로컬 브라우저 탐지 진화 (4주)

> 확장의 범위를 넘어서는 네이티브 앱 전환 단계. [`native/README.md`](./native/README.md)에 상세 스캐폴딩 가이드 작성 완료. 실제 코드 포팅은 다음 마일스톤에서 진행.

**3.1 데스크톱 네이티브 앱 (Electron/Tauri)**
- [x] 기술 비교 + 추천(Tauri 2) 문서화
- [x] 디렉토리 구조 / 포팅 전략 정의
- [ ] Tauri 프로젝트 생성 및 첫 CDP 연결 (M1)
- [ ] 멀티 브라우저(Chrome/Edge/Arc/Brave) CDP 연결 (M1-M2)
- [ ] Firefox WebDriver BiDi 어댑터 (추가 이터레이션)

**3.2 화면 분석**
- [x] 캡처 + OCR 전략 정의(OS별 API, Tesseract vs Gemini Vision 비교)
- [ ] 실제 구현 (Phase 3 M4)

**3.3 크로스 브라우저 통합**
- [x] 통합 대시보드 구조 가이드 작성
- [ ] 실제 구현 (Phase 3 M5)

### Phase 4 — 고급 기능 (3주)

**4.1 페이지 변경 감시**
- [x] 관심 페이지 등록 → `chrome.alarms`로 15분 주기 백그라운드 감시
- [x] 변경사항 알림 — `chrome.notifications` + 가격/재고 힌트 파싱
- [x] 변경 이력 타임라인 — 팝업 "감시" 탭의 히스토리 뷰

**4.2 북마크/히스토리 통합**
- [x] 분석 결과를 IndexedDB 북마크처럼 저장 (URL + 요약 + 메타)
- [x] 키워드 검색 — 제목/URL/요약/태그 통합 검색
- [x] 태그 기반 분류 — 팝업에서 태그 추가/제거, 태그 필터 pill

**4.3 자동 번역 + 요약**
- [x] 외국어 페이지 자동 감지 (`html[lang]` + 텍스트 샘플 통계)
- [x] 번역 + 요약 조합 — 프롬프트 레벨에서 한국어 번역 지시, 언어 배지 표시
- [x] 사용자가 자동 번역 on/off 설정 가능

---

## 5. 기술 스택

### Chrome Extension (Phase 1-2)
| 구분 | 기술 |
|------|------|
| 플랫폼 | Chrome Extension MV3 |
| 언어 | JavaScript (ES Modules) |
| 캐시 | IndexedDB |
| AI | Gemini API (Streaming) |

### 네이티브 앱 (Phase 3-4)
| 구분 | 기술 |
|------|------|
| 프레임워크 | Electron 또는 Tauri 2 |
| 브라우저 연동 | Chrome DevTools Protocol |
| 화면 분석 | Tesseract OCR / Gemini Vision |
