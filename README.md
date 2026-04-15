# JARVIS — AI Web Page Analyzer

> 아이언맨의 JARVIS에서 영감을 받은 Chrome 확장 프로그램. 방문 중인 웹페이지를 Google Gemini AI로 분석하고 요소별 설명, 관련 링크, 태그, 페이지 요약을 제공합니다.

## 주요 기능

- **페이지 자동 분석** — 웹페이지의 제목, 링크, 버튼 등 주요 요소(최대 50개)를 수집하여 Gemini API로 분석
- **요소별 JARVIS 배지** — 각 요소에 아이콘을 부착하고 호버 시 설명, 관련 링크, 태그를 배지로 표시
- **페이지 요약 패널** — 우측 하단에 페이지 전체 요약을 표시
- **후속 질문 채팅** — 같은 페이지 맥락으로 JARVIS에게 추가 질문 가능
- **자동 활성화** — 설정 시 페이지 로드 5초 후 자동으로 분석 시작
- **탭 단위 중복 방지** — 같은 탭에서 한 번만 활성화, 새로고침 시 초기화

## 기술 스택

| 구분 | 기술 |
|------|------|
| 플랫폼 | Chrome Extension Manifest V3 |
| 언어 | Vanilla JavaScript (ES6+) |
| 스타일 | CSS3 (그라데이션, 애니메이션) |
| AI | Google Gemini API (REST) |
| 저장소 | `chrome.storage.local` |

## 프로젝트 구조

```
plex-jarvis/
├── manifest.json          # MV3 매니페스트 (권한, 스크립트 정의)
├── background.js          # 서비스 워커 (탭 활성화, 타이머 관리)
├── content.js             # 콘텐츠 스크립트 (페이지 분석, UI 렌더링, 채팅)
├── content.css            # 콘텐츠 스크립트 스타일
├── popup.html/css/js      # 설정 팝업 (API 키, 모델, 자동 활성화)
├── icons/                 # 확장 아이콘 (SVG/PNG)
├── generate-icons.html    # 브라우저에서 PNG 아이콘 생성
└── ICON_INSTRUCTIONS.md   # 아이콘 생성 절차
```

## 설치

1. 아이콘 준비: `generate-icons.html`을 브라우저에서 열어 `icons/icon16.png`, `icon48.png`, `icon128.png` 생성
2. Chrome에서 `chrome://extensions/` 접속
3. **개발자 모드** 활성화
4. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 이 폴더 선택

## 설정

| 항목 | 설명 |
|------|------|
| Gemini API 키 | [Google AI Studio](https://makersuite.google.com/app/apikey)에서 발급 후 팝업에 입력 |
| 모델 선택 | `gemini-2.5-flash` (기본), 2.5 Pro, 2.0 Flash Exp 등 |
| 자동 활성화 | 체크 시 페이지 로드 후 5초 대기 → 자동 분석 |

## 라이선스

MIT
