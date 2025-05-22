// popup.js

const toggleBtn = document.getElementById("toggleStart");
const statusBar = document.getElementById("statusBar");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
let isActive = false;

// 버튼 업데이트
function updateToggleButton() {
  console.log("버튼 상태 업데이트:", isActive);
  
  if (isActive) {
    toggleBtn.textContent = "停止使用";
    toggleBtn.className = "active";
    statusBar.className = "status-bar active";
  } else {
    toggleBtn.textContent = "开始使用"; 
    toggleBtn.className = "inactive";
    statusBar.className = "status-bar";
  }
}

// 상태 로드
function loadState() {
  console.log("상태 로드 시작");
  
  // Background에서 상태 가져오기
  chrome.runtime.sendMessage({ action: "getState" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("통신 오류:", chrome.runtime.lastError);
      
      // 로컬 스토리지에서 백업으로 가져오기
      const savedState = localStorage.getItem("highlightActive");
      isActive = savedState === "true";
    } else if (response) {
      console.log("background로부터 상태 받음:", response.isActive);
      isActive = response.isActive;
    }
    
    updateToggleButton();
  });
}

// 상태 저장
function saveState() {
  console.log("상태 저장:", isActive);
  
  // 로컬 스토리지에 저장
  localStorage.setItem("highlightActive", isActive);
  
  // background에 알림
  chrome.runtime.sendMessage({ 
    action: "updateState", 
    isActive: isActive 
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("background 통신 실패");
    } else if (response) {
      console.log("background 응답:", response);
    }
  });
}

// 토글 버튼 클릭
toggleBtn.addEventListener("click", () => {
  isActive = !isActive;
  console.log("버튼 클릭 - 상태 변경:", isActive);
  
  saveState();
  updateToggleButton();

  // content script에 알림
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: isActive ? "start" : "stop" 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("content script 통신 실패");
        } else if (response) {
          console.log("content script 응답:", response);
        }
      });
    }
  });
});

// 저장 버튼
saveBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].id) {
      alert("无法获取当前标签页。");
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, { action: "getHighlights" }, (response) => {
      if (chrome.runtime.lastError) {
        alert("无法与页面通信，请确保在网页上使用此功能。");
        return;
      }
      
      if (response && response.data && response.data.length > 0) {
        const now = new Date();
        const dateStr = now.getFullYear() + 
                       String(now.getMonth() + 1).padStart(2, '0') + 
                       String(now.getDate()).padStart(2, '0') + '_' +
                       String(now.getHours()).padStart(2, '0') + 
                       String(now.getMinutes()).padStart(2, '0');
        
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { 
          type: "application/json" 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `高亮备份_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert("没有发现高亮数据，请先在网页上进行高亮。");
      }
    });
  });
});

// 로드 버튼
loadBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        
        if (!Array.isArray(data) || data.length === 0) {
          alert("无效的备份文件或数据为空");
          return;
        }
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0] || !tabs[0].id) {
            alert("无法获取当前标签页。");
            return;
          }
          
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: "loadHighlights", 
            data 
          }, (response) => {
            if (chrome.runtime.lastError) {
              alert("无法与页面通信，请确保在网页上使用此功能。");
            } else if (response && response.success) {
              alert("数据恢复成功！共恢复 " + data.length + " 条高亮。");
            } else {
              alert("数据恢复失败。");
            }
          });
        });
      } catch (err) {
        alert("文件格式无效，请选择正确的备份文件。");
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup 로드됨");
  setTimeout(loadState, 50);
});

// 빠른 초기화를 위해 즉시 실행
loadState();