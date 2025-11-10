// 백그라운드 서비스 워커 - 타이머 관리 및 중복 방지

// 탭별 활성화 상태 추적
const activeTabs = new Map();

// 탭이 업데이트될 때마다 초기화
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // 페이지가 로딩 시작되면 해당 탭의 활성화 상태 초기화
    activeTabs.delete(tabId);
  }
});

// 탭이 닫힐 때 정리
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkActivation') {
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ shouldActivate: false });
      return;
    }

    // 이미 활성화된 탭인지 확인
    if (activeTabs.has(tabId)) {
      sendResponse({ shouldActivate: false, reason: 'already_activated' });
      return;
    }

    // 설정 확인
    chrome.storage.local.get(['apiKey', 'autoActivate'], (result) => {
      if (!result.apiKey) {
        sendResponse({ shouldActivate: false, reason: 'no_api_key' });
        return;
      }

      if (result.autoActivate === false) {
        sendResponse({ shouldActivate: false, reason: 'auto_activate_disabled' });
        return;
      }

      // 5초 타이머 시작
      setTimeout(() => {
        // 타이머가 끝난 후에도 탭이 여전히 활성화되지 않았는지 확인
        if (!activeTabs.has(tabId)) {
          activeTabs.set(tabId, true);
          
          // 콘텐츠 스크립트에 활성화 신호 전송
          chrome.tabs.sendMessage(tabId, {
            type: 'activateJarvis'
          }).catch(() => {
            // 탭이 닫혔거나 메시지를 받을 수 없는 경우
            activeTabs.delete(tabId);
          });
        }
      }, 5000);

      sendResponse({ shouldActivate: true, timerStarted: true });
    });

    return true; // 비동기 응답을 위해 true 반환
  }

  if (message.type === 'jarvisActivated') {
    const tabId = sender.tab?.id;
    if (tabId) {
      activeTabs.set(tabId, true);
    }
    sendResponse({ success: true });
  }
});

// 확장 프로그램 설치 시
chrome.runtime.onInstalled.addListener(() => {
  console.log('JARVIS 확장 프로그램이 설치되었습니다.');
});

