# JARVIS Native — Phase 3 스캐폴딩 가이드

브라우저 독립 데스크톱 앱으로 진화시키기 위한 단계별 가이드. 확장(Phase 1-2) 코드를 최대한 재사용하는 방향을 권장합니다.

## 1. 프레임워크 선택

### 비교

| 항목 | Electron | Tauri 2 |
|------|----------|---------|
| 번들 크기 | 100MB+ | 3~10MB |
| 언어 (네이티브) | Node.js | Rust |
| UI 런타임 | Chromium (embed) | 시스템 WebView (WebKit/WebView2) |
| CDP 직접 연결 | 쉬움 (ws/chrome-remote-interface) | 가능 (Rust HTTP/WS 클라이언트) |
| 권장 대상 | 빠른 프로토타이핑 / CDP 집중 | 배포 용량/성능 중시, 멀티 브라우저 |

**추천**: Tauri 2. 번들 크기, 성능, 보안 모델(권한 최소화) 이점이 큽니다.

## 2. 초기 구조 (Tauri 기준)

```
native/
├── src-tauri/
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs                # 진입점 + 윈도우 생성
│       ├── browser.rs             # CDP 클라이언트 (chromiumoxide 크레이트)
│       ├── capture.rs             # screencast/ocr 연동
│       └── watch.rs               # 관심 페이지 변경 감시 (기존 확장 기능 포팅)
├── src/
│   ├── index.html
│   ├── main.ts
│   ├── modules/                   # 확장의 modules/ 코드 포팅
│   │   ├── analyzer.ts
│   │   ├── renderer.ts
│   │   └── cache.ts               # IDB 대신 tauri fs/sqlite
│   └── styles.css
├── package.json
└── README.md
```

## 3. Chrome DevTools Protocol 연동

- Chromium 기반 브라우저(크롬/엣지/아크/브레이브)는 `--remote-debugging-port=9222`로 실행되어 있어야 합니다.
- `http://localhost:9222/json`에서 탭 목록 확인 후 각 탭의 `webSocketDebuggerUrl`에 접속.
- 주요 도메인/메소드:
  - `Page.navigate`, `Page.captureScreenshot`
  - `DOM.getDocument` + `DOM.querySelectorAll`
  - `Runtime.evaluate` — 확장과 동일한 `collectPageInfo()`를 페이지 컨텍스트에서 실행
  - `Page.setLifecycleEventsEnabled` — 페이지 이벤트 스트림
- Rust: `chromiumoxide`, Node/Electron: `chrome-remote-interface`

> 브라우저에 디버깅 포트 옵션이 없으면 앱에서 안내 배너를 띄워 사용자가 재시작하도록 합니다.

## 4. Firefox — WebDriver BiDi

- Firefox 101+부터 BiDi 표준을 실험 지원 (`remote.active-protocols=3`).
- `geckodriver --bidi` 또는 Firefox `--remote-debugging-port` 사용.
- 메시지 포맷은 CDP와 다름 — 별도 어댑터 필요.
- 초기에는 Chromium 계열만 지원하고, Firefox는 다음 이터레이션으로 밀어도 됩니다.

## 5. 화면 캡처 + OCR

- 캡처: CDP `Page.captureScreenshot` (브라우저 창) 또는 OS API (바깥 앱 포함):
  - macOS: `CGWindowListCreateImage` + `NSWorkspace`로 활성 윈도우
  - Windows: `PrintWindow` + `GetForegroundWindow`
  - Linux (X11/Wayland): `xdpyinfo`/`grim` 등
- OCR: Tesseract (tesseract-ocr crate) 또는 Gemini Vision(`inlineData` base64 이미지 전송)
- 간단 경로: OCR 없이 전체 스크린샷을 Gemini Vision으로 바로 분석 (모델 선택: `gemini-2.5-pro`).

## 6. 크로스 브라우저 통합 대시보드

- 앱 UI에는 좌측 사이드바에 브라우저별 탭 트리, 우측에 분석/채팅 패널.
- 각 탭마다 CDP 연결을 유지하면 부하가 크므로, 선택된 탭만 attach + 주기적 폴링.
- 확장의 `cache.js` 스토어를 SQLite (tauri-plugin-sql) 또는 `dexie-wasm`로 대체 — 크로스 프로세스 공유가 필요하면 SQLite가 편합니다.

## 7. 재사용 전략

- **공통 코드**: `modules/collector.ts`, `modules/analyzer.ts`, `modules/renderer.ts`를 TypeScript로 포팅해 앱 프론트엔드에서 재사용.
- **다른 점**:
  - DOM 수집은 CDP `Runtime.evaluate`로 원격 브라우저 탭에서 실행
  - 캐시 스토어는 SQLite (스키마는 기존 IDB와 1:1 매핑)
  - 활성화 트리거는 앱 UI 버튼 + "자동 감시 간격"

## 8. 마일스톤

- M1: Tauri 프로젝트 생성, CDP로 첫 탭 제목/URL 가져오기
- M2: 확장의 `collectPageInfo`/`analyzePage` 포팅, 결과를 앱 패널에 표시
- M3: SQLite 캐시 + Watchlist (확장의 `background/cache.js` 포팅)
- M4: 화면 캡처 + Gemini Vision 경로
- M5: 멀티 브라우저 트리, 통합 검색

## 9. 보안/권한

- CDP 포트는 `127.0.0.1`만 열기 (Tauri에서 바인딩 고정).
- API 키는 OS secure storage(keychain/credential manager) 사용 — `keyring` crate.
- 화면 캡처 권한 고지 & 첫 실행 시 OS 권한 요청.

---

Phase 3 진입 시점에 본 파일을 실제 `src-tauri/` 구조로 확장하세요.
