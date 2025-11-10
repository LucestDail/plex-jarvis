// 팝업 스크립트 - 설정 저장 및 로드

document.addEventListener('DOMContentLoaded', async () => {
  const versionSelect = document.getElementById('gemini-model');
  const apiKeyInput = document.getElementById('api-key');
  const toggleKeyBtn = document.getElementById('toggle-key');
  const autoActivateCheckbox = document.getElementById('auto-activate');
  const saveBtn = document.getElementById('save-btn');
  const statusMessage = document.getElementById('status-message');

  // 저장된 설정 로드
  const loadSettings = async () => {
    const result = await chrome.storage.local.get(['geminiModel', 'apiKey', 'autoActivate']);
    
    if (result.geminiModel) {
      versionSelect.value = result.geminiModel;
    }
    
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    
    if (result.autoActivate !== undefined) {
      autoActivateCheckbox.checked = result.autoActivate;
    }
  };

  // 설정 저장
  const saveSettings = async () => {
    const version = versionSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const autoActivate = autoActivateCheckbox.checked;

    if (!apiKey) {
      showStatus('API 키를 입력해주세요.', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        geminiModel: version,
        apiKey: apiKey,
        autoActivate: autoActivate
      });

      showStatus('설정이 저장되었습니다!', 'success');
      
      // 2초 후 상태 메시지 숨기기
      setTimeout(() => {
        hideStatus();
      }, 2000);
    } catch (error) {
      showStatus('설정 저장 중 오류가 발생했습니다.', 'error');
      console.error('Error saving settings:', error);
    }
  };

  // 상태 메시지 표시
  const showStatus = (message, type) => {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
  };

  // 상태 메시지 숨기기
  const hideStatus = () => {
    statusMessage.style.display = 'none';
    statusMessage.className = 'status-message';
  };

  // API 키 표시/숨기기 토글
  toggleKeyBtn.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
    toggleKeyBtn.textContent = type === 'password' ? '👁️' : '🙈';
  });

  // 저장 버튼 클릭
  saveBtn.addEventListener('click', saveSettings);

  // Enter 키로 저장
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });

  // 초기 설정 로드
  await loadSettings();
});

