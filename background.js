// background.js

let isActive = false;

// 아이콘 상태 업데이트
async function updateIcon(active) {
  console.log('아이콘 업데이트:', active ? '활성화' : '비활성화');
  
  try {
    // 아이콘 변경 시도
    if (active) {
      await chrome.action.setIcon({ 
        path: {
          "16": "icon16_yellow.png",
          "48": "icon48_yellow.png", 
          "128": "icon128_yellow.png"
        }
      });
    } else {
      await chrome.action.setIcon({ 
        path: {
          "16": "icon16.png",
          "48": "icon48.png",
          "128": "icon128.png"
        }
      });
    }
    
    // 배지 설정
    await chrome.action.setBadgeText({ text: active ? "ON" : "" });
    if (active) {
      await chrome.action.setBadgeBackgroundColor({ color: "#28a745" });
    }
    
    // 제목 설정
    await chrome.action.setTitle({ 
      title: active ? "SZD-Annotator (使用中)" : "SZD-Annotator" 
    });
    
    console.log('아이콘/배지/제목 변경 완료');
  } catch (error) {
    console.log('아이콘 변경 실패:', error);
  }
}

// 초기화 함수
function initialize() {
  chrome.storage.local.get(['highlightActive'], (result) => {
    // 저장소에 상태가 없으면 기본값 false
    isActive = result.highlightActive === true;
    console.log('초기 상태 로드:', isActive);
    updateIcon(isActive);
  });
}

// 확장 프로그램 설치/업데이트 시
chrome.runtime.onInstalled.addListener(() => {
  console.log('확장 프로그램 설치/업데이트');
  initialize();
});

// 브라우저 시작 시
chrome.runtime.onStartup.addListener(() => {
  console.log('브라우저 시작');
  initialize(); 
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('메시지 수신:', request.action);
  
  if (request.action === 'updateState') {
    isActive = request.isActive === true;
    console.log('상태 업데이트:', isActive);
    
    // storage에 저장
    chrome.storage.local.set({ highlightActive: isActive }, () => {
      console.log('저장소에 상태 저장 완료');
    });
    
    updateIcon(isActive);
    sendResponse({ success: true, isActive });
    return true;
  }
  
  if (request.action === 'getState') {
    console.log('상태 반환:', isActive);
    sendResponse({ isActive });
    return true;
  }
});

// 처음 실행 시 초기화
console.log("Background script 시작");
initialize();