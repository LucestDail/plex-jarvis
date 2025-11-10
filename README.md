# JARVIS - AI Assistant Chrome Extension

아이언맨의 JARVIS를 모티브로 한 AI 기반 크롬 확장 프로그램입니다. 웹페이지를 분석하여 관련 정보와 부가 설명을 제공합니다.

## 주요 기능

1. **자동 활성화**: 페이지에서 5초 이상 머무르면 자동으로 AI 분석 시작
2. **중복 방지**: 각 페이지당 한 번만 실행되며, 새로고침 시 다시 활성화 가능
3. **부가 정보 제공**: 페이지의 제목, 링크 등에 대한 AI 기반 설명과 관련 링크 제공
4. **비침투적 디자인**: 기존 웹사이트의 스타일과 레이아웃을 존중하며 자연스럽게 통합

## 설치 방법

1. 이 저장소를 클론하거나 다운로드합니다.
2. Chrome 확장 프로그램 설치:
   - Chrome 브라우저에서 `chrome://extensions/`로 이동합니다.
   - 우측 상단의 "개발자 모드"를 활성화합니다.
   - "압축해제된 확장 프로그램을 로드합니다"를 클릭합니다.
   - 이 프로젝트 폴더를 선택합니다.

## 설정 방법

1. Chrome 확장 프로그램 아이콘을 클릭합니다.
2. Gemini 모델을 선택합니다 (기본값: Gemini 2.5 Flash 권장).
3. Gemini API 키를 입력합니다. (Google AI Studio에서 발급 가능: https://makersuite.google.com/app/apikey)
4. "자동 활성화" 옵션을 켜거나 끕니다.
5. "설정 저장" 버튼을 클릭합니다.

**참고**: 사용 가능한 모델 목록은 [Gemini API 문서](https://ai.google.dev/gemini-api/docs/models?hl=ko)를 참조하세요.

## 사용 방법

1. 설정에서 API 키를 등록합니다.
2. 웹페이지를 방문합니다.
3. 페이지에서 5초 이상 머무르면 JARVIS가 자동으로 활성화됩니다.
4. 활성화되면 페이지의 요소에 마우스를 올리면 부가 정보가 표시됩니다.
5. 우측 하단에 페이지 요약이 표시됩니다.

## 파일 구조

```
plex-jarvis/
├── manifest.json          # 확장 프로그램 설정
├── popup.html             # 설정 팝업 HTML
├── popup.css              # 설정 팝업 스타일
├── popup.js               # 설정 팝업 스크립트
├── background.js          # 백그라운드 서비스 워커
├── content.js             # 콘텐츠 스크립트 (페이지에 주입)
├── content.css            # 콘텐츠 스타일
├── icons/                 # 아이콘 폴더
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── generate-icons.html    # 아이콘 생성 도구
└── README.md              # 이 파일
```

## 기술 스택

- Chrome Extension Manifest V3
- Google Gemini API
- Vanilla JavaScript
- CSS3 (애니메이션 및 그라데이션)

## 주의사항

- Gemini API 키가 필요합니다.
- API 사용량에 따라 비용이 발생할 수 있습니다.
- 일부 웹사이트에서는 콘텐츠 스크립트가 제한될 수 있습니다.

## 라이선스

MIT License

