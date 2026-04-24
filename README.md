# JARVIS — AI Web Page Analyzer

> 아이언맨의 JARVIS에서 영감을 받은 Chrome 확장 프로그램. 방문 중인 웹페이지를 Google Gemini AI로 분석하고 요소별 설명, 관련 링크, 태그, 요약, 스트리밍 채팅, 번역, 페이지 변경 감시까지 제공합니다.

## 주요 기능

### 분석 & 캐싱
- **페이지 자동 분석** — 뷰포트 근접 우선 순서로 주요 요소(최대 50개)를 수집해 Gemini로 증강 분석
- **청크 분할 병렬 호출** — 12개 단위 `Promise.all`로 동시 요청
- **URL 캐싱 (IndexedDB)** — 같은 URL 재방문 시 즉시 표시, TTL/사용 여부 설정
- **증분 분석** — `MutationObserver`로 DOM 변경 감지 → 새로 등장한 요소만 추가 분석
- **뷰포트 우선** — 화면에 보이는 요소부터 분석하여 체감 속도 개선

### 채팅
- **Streaming 답변** — Gemini `streamGenerateContent?alt=sse`로 실시간 토큰 출력 + 실패 시 단일 응답 폴백
- **마크다운 + 구문 강조** — 코드 블록에 간이 하이라이터(키워드/문자열/주석/숫자) + 언어 라벨
- **링크/이미지 프리뷰** — 이미지 URL은 인라인 썸네일, 일반 링크는 favicon + host 배지
- **맥락 유지** — 페이지 요약 + 최근 6턴 대화 + 포커스된 요소를 프롬프트에 포함
- **요소 지정 질의** — 배지의 "💬 이것에 대해 질문" 클릭으로 특정 요소에 집중
- **비교 질의** — "⚖️ 비교에 추가" 버튼으로 2개 이상 선택 후 자동 비교 프롬프트 생성
- **대화 내보내기** — 텍스트 / 마크다운 다운로드
- **URL별 대화 이력 저장/복원** — IndexedDB에 영구 저장

### 언어
- **외국어 자동 감지** — `html[lang]` + 텍스트 샘플 통계로 한국어 여부 판정
- **자동 번역 모드** — 외국어 페이지를 한국어로 번역해 요약/설명 생성 (설정에서 on/off)

### 페이지 감시
- **관심 페이지 등록** — 요약 패널의 🔕 버튼으로 토글
- **백그라운드 주기 감시** — `chrome.alarms` 15분 주기로 제목/H1/링크 수/가격·재고 힌트 변화 탐지
- **변경 알림** — `chrome.notifications`로 desktop 알림 + 가격/재고 변화 표시
- **변경 이력 타임라인** — 팝업 "감시" 탭에서 히스토리 확인

### 북마크/검색/태그
- **태그 편집/필터** — 팝업에서 + 태그 추가/삭제, 태그 pill 필터
- **통합 검색** — 제목/URL/요약/태그 전역 검색
- **정렬** — 최근 업데이트 순

### 에러 복구
- **지수 백오프 재시도** — 429/503에 대해 대기 후 재시도
- **토큰 초과 자동 축소** — 400 응답 시 요소 수 절반 감량 + 텍스트 80자 압축 후 재요청
- **네트워크 오류 폴백** — 기존 캐시로 패널 복구
- **API 키 테스트 버튼** — 팝업에서 즉시 키 유효성 확인

## 기술 스택

| 구분 | 기술 |
|------|------|
| 플랫폼 | Chrome Extension Manifest V3 |
| 언어 | Vanilla JavaScript (ES6+, IIFE + `window.JARVIS` 네임스페이스) |
| 캐시 | IndexedDB (확장 origin 단일 DB, background service worker 관리) |
| AI | Google Gemini API (structured output + SSE streaming) |
| 스타일 | CSS3 (그라데이션, 애니메이션, 리사이즈 핸들, 구문 강조) |
| 감시 | `chrome.alarms` + `chrome.notifications` + background fetch |
| 저장소 | `chrome.storage.local` (설정), IndexedDB (분석/채팅/감시/이력) |

## 프로젝트 구조

```
plex-jarvis/
├── manifest.json              # MV3 매니페스트 (alarms/notifications 포함)
├── background.js              # 서비스 워커 (활성화/캐시/감시 라우팅)
├── background/
│   └── cache.js               # IndexedDB 코어 (analysis/chat/watchlist/history)
├── content.js                 # 오케스트레이터 (활성화/증분/채팅/번역/내보내기)
├── modules/
│   ├── cache.js               # 캐시 메시지 클라이언트
│   ├── collector.js           # DOM 수집 + 뷰포트 우선순위 + 언어 감지
│   ├── analyzer.js            # Gemini structured + streaming + 복구
│   └── renderer.js            # 배지/요약 패널/채팅/마크다운/하이라이트
├── content.css                # 콘텐츠 스크립트 스타일
├── popup.html/css/js          # 설정 / 캐시 / 감시 3탭 UI
├── native/
│   └── README.md              # Phase 3 네이티브 앱 스캐폴딩 가이드
├── icons/
├── generate-icons.html
└── ICON_INSTRUCTIONS.md
```

## 설치

1. 아이콘 준비: `generate-icons.html`을 브라우저에서 열어 `icons/icon16.png`, `icon48.png`, `icon128.png` 생성
2. Chrome `chrome://extensions/`
3. **개발자 모드** 활성화
4. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더 선택
5. 이미 설치되어 있다면 **다시 로드** 버튼 클릭

## 설정 (팝업 — 설정 탭)

| 항목 | 설명 |
|------|------|
| Gemini 모델 | `gemini-2.5-flash` (기본) / 2.5 Pro / 2.0 Flash Exp / 1.5 |
| API 키 | [Google AI Studio](https://makersuite.google.com/app/apikey)에서 발급 |
| API 키 테스트 | 버튼 클릭 시 즉시 키 유효성 검증 |
| 자동 활성화 | 페이지 로드 + idle 이후 자동 분석 |
| 자동 활성화 지연 (초) | 기본 2초 |
| URL 분석 결과 캐시 | 재방문 시 즉시 표시 |
| 캐시 유효기간 (시간) | 기본 24시간 |
| 외국어 페이지 자동 번역 | 한국어가 아닌 페이지를 한국어로 번역 분석 (기본 ON) |

## 캐시 탭

- **현재 탭 재분석** / **현재 URL 캐시 삭제** / **전체 캐시 삭제**
- **통합 검색** (제목/URL/요약/태그)
- **태그 pill 필터** + 태그 편집(+/×)
- 각 항목: 열기 / 삭제

## 감시 탭

- 관심 페이지 목록 (등록 시각 / 마지막 확인 시각)
- 이력 버튼 → 변경 타임라인 표시
- 등록은 요약 패널 우측 상단 🔕/🔔 버튼으로 토글

## 동작 흐름

1. 페이지 로드 후 `requestIdleCallback` + 사용자 지연 대기
2. background에 활성화 체크 → 설정값 지연 후 `activateJarvis`
3. 뷰포트 근접 요소 우선 DOM 수집, 언어 감지, 시그니처 계산
4. 동일 URL + 시그니처 + 번역 모드 일치의 유효 캐시가 있으면 **즉시 표시**
5. 없으면 청크 분할 병렬 호출. 실패 시 지수 백오프 / 토큰 초과 시 자동 축소
6. 결과를 배지 + 요약 패널 + 대화 이력 복원으로 렌더
7. `MutationObserver`로 변경 감지 → **증분 분석** 후 캐시 병합
8. 채팅은 SSE 스트리밍으로 실시간 토큰 출력, 실패 시 단일 응답 폴백
9. 감시 중인 페이지는 백그라운드에서 15분 주기 시그니처 비교 + 변경 알림

## Phase별 진행 현황

- Phase 1 (구조/캐싱/성능): **완료**
- Phase 2 (채팅 UI/심화 질의/에러 복구): **완료**
- Phase 3 (네이티브 앱): **가이드 문서 완료**, 실제 포팅은 `native/README.md` 참고
- Phase 4 (페이지 감시/북마크/번역): **완료**

자세한 체크리스트는 [`PLAN.md`](./PLAN.md) 참조.

## 라이선스

MIT
