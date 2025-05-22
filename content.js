// content.js

// 전역 변수
const highlights = new Map();
let isActive = false;
let currentTooltip = null;
let isInitialized = false;

// 부드럽고 고급스러운 하이라이트 색상들
const colors = [
  { name: "연한 노란색", value: "#fff9e6" },
  { name: "연한 초록색", value: "#e8f5e8" },  
  { name: "연한 파란색", value: "#e3f2fd" },
  { name: "연한 분홍색", value: "#fce4ec" },
  { name: "연한 보라색", value: "#f3e5f5" }
];

// ===== 텍스트 위치 저장/복원 시스템 =====

function serializeTextPosition(range) {
  const selectedText = range.toString();
  const beforeText = getContextText(range.startContainer, range.startOffset, -50);
  const afterText = getContextText(range.endContainer, range.endOffset, 50);
  
  return {
    selectedText,
    beforeText,
    afterText,
    url: window.location.href
  };
}

function getContextText(node, offset, length) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (length > 0) {
      // 이후 텍스트
      return text.substring(offset, Math.min(offset + length, text.length));
    } else {
      // 이전 텍스트  
      const start = Math.max(0, offset + length);
      return text.substring(start, offset);
    }
  }
  return "";
}

function deserializeTextPosition(data) {
  const { selectedText, beforeText, afterText } = data;
  
  // TreeWalker로 하이라이트되지 않은 텍스트만 검색
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.parentElement && 
            (node.parentElement.tagName === 'SCRIPT' || 
             node.parentElement.tagName === 'STYLE' ||
             node.parentElement.classList.contains('highlight-text') ||
             node.parentElement.classList.contains('comment-display'))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  // 전체 원본 텍스트 구성 (하이라이트 제외)
  let fullText = '';
  let textNodes = [];
  let node;
  
  while (node = walker.nextNode()) {
    textNodes.push({
      node,
      start: fullText.length,
      end: fullText.length + node.textContent.length
    });
    fullText += node.textContent;
  }
  
  // 패턴 매칭으로 위치 찾기
  const fullPattern = beforeText + selectedText + afterText;
  const patternIndex = fullText.indexOf(fullPattern);
  
  if (patternIndex === -1) {
    console.log("텍스트 패턴을 찾을 수 없음");
    return null;
  }
  
  const targetStart = patternIndex + beforeText.length;
  const targetEnd = targetStart + selectedText.length;
  
  // 시작과 끝 노드 찾기
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;
  
  for (let nodeInfo of textNodes) {
    if (!startNode && nodeInfo.end > targetStart) {
      startNode = nodeInfo.node;
      startOffset = targetStart - nodeInfo.start;
    }
    
    if (nodeInfo.end >= targetEnd) {
      endNode = nodeInfo.node;
      endOffset = targetEnd - nodeInfo.start;
      break;
    }
  }
  
  if (startNode && endNode) {
    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      
      if (range.toString() === selectedText) {
        return range;
      }
    } catch (e) {
      console.log("Range 생성 실패:", e);
    }
  }
  
  return null;
}

// ===== 하이라이트 생성/관리 =====

function createHighlight(range, color = "#fff9e6", comment = "") {
  const id = generateId();
  const selectedText = range.toString();

  // DOM 변경 전에 위치 정보를 먼저 저장
  const textPosition = serializeTextPosition(range.cloneRange());

  // 하이라이트 span 생성
  const span = document.createElement("span");
  span.style.backgroundColor = color;
  span.style.cursor = "pointer";
  span.style.padding = "1px 3px";
  span.style.borderRadius = "3px";
  span.style.transition = "opacity 0.2s ease";
  span.dataset.highlightId = id;
  span.className = "highlight-text";

  try {
    range.surroundContents(span);
    console.log("하이라이트 생성 성공:", selectedText);
  } catch (error) {
    // fallback 방식
    const text = range.toString();
    span.textContent = text;
    range.deleteContents();
    range.insertNode(span);
    console.log("하이라이트 생성 (fallback):", text);
  }

  // 하이라이트 데이터 저장 (이미 저장된 textPosition 사용)
  const highlightData = {
    id,
    span,
    comment: comment || "",
    color,
    text: selectedText,
    textPosition,
    commentSpan: null
  };
  
  highlights.set(id, highlightData);

  // 이벤트 리스너 추가
  addEventListeners(span, id);
  
  // 코멘트가 있으면 즉시 표시
  if (comment && comment.trim()) {
    updateComment(id, comment);
  }

  saveHighlights();
  return id;
}

function addEventListeners(span, id) {
  span.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTooltip(id, e.clientX, e.clientY);
  });

  span.addEventListener("mouseenter", () => {
    span.style.opacity = "0.8";
  });

  span.addEventListener("mouseleave", () => {
    span.style.opacity = "1";
  });
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substring(2);
}

// ===== 하이라이트 수정/삭제 =====

function updateComment(id, newComment) {
  console.log("코멘트 업데이트:", id, newComment);
  
  const hl = highlights.get(id);
  if (!hl) return;
  
  hl.comment = newComment || "";
  
  // 기존 코멘트 span 제거
  removeCommentSpan(id);
  
  // 새 코멘트가 있으면 생성
  if (newComment && newComment.trim()) {
    createCommentSpan(id, newComment);
  }
  
  saveHighlights();
}

function createCommentSpan(id, comment) {
  const hl = highlights.get(id);
  if (!hl || !hl.span.parentNode) return;
  
  const commentSpan = document.createElement("span");
  commentSpan.className = "comment-display";
  commentSpan.dataset.commentFor = id;
  commentSpan.style.cssText = `
    font-size: 0.85em;
    color: #666;
    font-style: italic;
    margin-left: 4px;
    font-weight: 400;
    opacity: 0.8;
  `;
  commentSpan.textContent = `(${comment})`;
  
  hl.span.insertAdjacentElement('afterend', commentSpan);
  hl.commentSpan = commentSpan;
}

function removeCommentSpan(id) {
  // data-comment-for 속성으로 찾기
  const existingComment = document.querySelector(`[data-comment-for="${id}"]`);
  if (existingComment) {
    existingComment.remove();
  }
  
  const hl = highlights.get(id);
  if (hl) {
    hl.commentSpan = null;
  }
}

function changeHighlightColor(id, newColor) {
  console.log("색상 변경:", id, newColor);
  
  const hl = highlights.get(id);
  if (!hl) return;
  
  // DOM에서 span 찾아서 색상 변경
  const span = document.querySelector(`[data-highlight-id="${id}"]`);
  if (span) {
    span.style.backgroundColor = newColor;
    hl.color = newColor;
    hl.span = span; // 참조 업데이트
    console.log("색상 변경 완료");
  }
  
  saveHighlights();
}

function removeHighlight(id) {
  const hl = highlights.get(id);
  if (!hl) return;
  
  // 코멘트 span 제거
  removeCommentSpan(id);
  
  // 하이라이트 span 제거 및 텍스트 복원
  const span = document.querySelector(`[data-highlight-id="${id}"]`);
  if (span && span.parentNode) {
    const textNode = document.createTextNode(span.textContent);
    span.parentNode.replaceChild(textNode, span);
  }
  
  highlights.delete(id);
  saveHighlights();
}

// ===== 툴팁 UI =====

function showTooltip(highlightId, x, y) {
  hideTooltip();
  
  const highlight = highlights.get(highlightId);
  if (!highlight) return;

  const tooltip = createTooltipElement(x, y);
  const { colorSection, commentSection } = createTooltipContent(highlightId, highlight);
  
  tooltip.appendChild(colorSection);
  tooltip.appendChild(commentSection);
  
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;
  
  // 텍스트 영역에 포커스
  const textarea = tooltip.querySelector("textarea");
  if (textarea) textarea.focus();
  
  // 외부 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener("mousedown", handleTooltipOutsideClick);
  }, 50);
}

function createTooltipElement(x, y) {
  const tooltip = document.createElement("div");
  tooltip.className = "highlight-tooltip";
  tooltip.style.cssText = `
    position: fixed;
    z-index: 10000;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    max-width: 300px;
    left: ${Math.min(x, window.innerWidth - 320)}px;
    top: ${Math.min(y + 15, window.innerHeight - 250)}px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  return tooltip;
}

function createTooltipContent(highlightId, highlight) {
  // 색상 선택 섹션
  const colorSection = document.createElement("div");
  colorSection.style.cssText = "margin-bottom: 16px; display: flex; align-items: center; gap: 10px;";
  
  const colorLabel = document.createElement("span");
  colorLabel.textContent = "颜色：";
  colorLabel.style.cssText = "font-size: 14px; color: #333; font-weight: 500;";
  colorSection.appendChild(colorLabel);

  // 색상 버튼들
  colors.forEach(color => {
    const colorBtn = createColorButton(color, highlight.color, highlightId);
    colorSection.appendChild(colorBtn);
  });

  // 삭제 버튼
  const deleteBtn = createDeleteButton(highlightId);
  colorSection.appendChild(deleteBtn);

  // 코멘트 섹션
  const commentSection = createCommentSection(highlightId, highlight.comment);

  return { colorSection, commentSection };
}

function createColorButton(color, currentColor, highlightId) {
  const isSelected = currentColor === color.value;
  const btn = document.createElement("button");
  btn.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent;
    background-color: ${color.value}; cursor: pointer; margin: 0 2px;
    transition: all 0.2s ease;
    ${isSelected ? 'border-color: #007bff; transform: scale(1.15); box-shadow: 0 2px 8px rgba(0,123,255,0.3);' : ''}
  `;
  
  btn.addEventListener("click", () => {
    changeHighlightColor(highlightId, color.value);
    hideTooltip();
  });
  
  btn.addEventListener("mouseenter", () => {
    if (!isSelected) btn.style.transform = "scale(1.1)";
  });
  
  btn.addEventListener("mouseleave", () => {
    if (!isSelected) btn.style.transform = "scale(1)";
  });
  
  return btn;
}

function createDeleteButton(highlightId) {
  const btn = document.createElement("button");
  btn.innerHTML = "🗑️";
  btn.style.cssText = `
    background: white; 
    color: #dc3545; 
    border: 2px solid #dc3545; 
    border-radius: 6px;
    width: 32px; height: 32px; 
    cursor: pointer; 
    margin-left: 8px;
    transition: all 0.2s ease;
    font-size: 14px;
  `;
  
  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = "#dc3545";
    btn.style.color = "white";
  });
  
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = "white";
    btn.style.color = "#dc3545";
  });
  
  btn.addEventListener("click", () => {
    removeHighlight(highlightId);
    hideTooltip();
  });
  
  return btn;
}

function createCommentSection(highlightId, currentComment) {
  const section = document.createElement("div");
  
  const label = document.createElement("div");
  label.textContent = "评论：";
  label.style.cssText = "font-size: 14px; margin-bottom: 8px; color: #333; font-weight: 500;";
  section.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.value = currentComment || "";
  textarea.placeholder = "在此输入您的评论...";
  textarea.style.cssText = `
    width: 100%; height: 80px; border: 1px solid #e0e0e0; border-radius: 8px;
    padding: 10px; font-size: 14px; resize: none; font-family: inherit;
    box-sizing: border-box; line-height: 1.4;
    transition: border-color 0.2s ease;
  `;
  section.appendChild(textarea);

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex; gap: 8px; margin-top: 12px;";
  
  // 저장 버튼
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "保存评论";
  saveBtn.style.cssText = `
    padding: 8px 16px; background: #28a745; color: white;
    border: none; border-radius: 6px; cursor: pointer; 
    font-size: 13px; font-weight: 500; flex: 1;
    transition: background-color 0.2s ease;
  `;
  saveBtn.addEventListener("click", () => {
    updateComment(highlightId, textarea.value.trim());
    hideTooltip();
  });
  
  // 삭제 버튼
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "清除评论";
  clearBtn.style.cssText = `
    padding: 8px 16px; background: white; color: #6c757d;
    border: 1px solid #6c757d; border-radius: 6px; cursor: pointer; 
    font-size: 13px; font-weight: 500; flex: 1;
    transition: all 0.2s ease;
  `;
  clearBtn.addEventListener("click", () => {
    updateComment(highlightId, "");
    hideTooltip();
  });
  
  buttonContainer.appendChild(saveBtn);
  buttonContainer.appendChild(clearBtn);
  section.appendChild(buttonContainer);
  
  return section;
}

function handleTooltipOutsideClick(e) {
  if (currentTooltip && !currentTooltip.contains(e.target) && !e.target.closest('.highlight-text')) {
    hideTooltip();
  }
}

function hideTooltip() {
  if (currentTooltip) {
    document.removeEventListener("mousedown", handleTooltipOutsideClick);
    currentTooltip.remove();
    currentTooltip = null;
  }
}

// ===== 텍스트 선택 이벤트 =====

document.addEventListener("mouseup", (e) => {
  if (!isActive) return;
  if (currentTooltip && currentTooltip.contains(e.target)) return;
  if (e.target.closest('.highlight-text, .comment-display')) return;

  // 약간의 지연으로 선택 상태 안정화
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const text = range.toString().trim();
    if (!text || text.length < 2) return;

    // 제외할 요소들
    const container = range.commonAncestorContainer;
    const parent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    if (parent.closest('script, style, .highlight-tooltip')) return;

    createHighlight(range);
    selection.removeAllRanges();
  }, 10);
});

// ===== 데이터 저장/로드 =====

function saveHighlights() {
  const data = Array.from(highlights.values()).map(hl => ({
    id: hl.id,
    textPosition: hl.textPosition,
    comment: hl.comment,
    color: hl.color,
    text: hl.text,
    timestamp: new Date().toISOString()
  }));
  
  const key = `highlights_${window.location.hostname}_${window.location.pathname}`;
  localStorage.setItem(key, JSON.stringify(data));
  console.log("저장 완료:", data.length, "개");
}

function loadHighlights() {
  if (isInitialized) return;
  isInitialized = true;
  
  const key = `highlights_${window.location.hostname}_${window.location.pathname}`;
  const saved = localStorage.getItem(key);
  if (!saved) {
    console.log("저장된 하이라이트 없음");
    return;
  }
  
  try {
    const data = JSON.parse(saved);
    console.log("하이라이트 로드 시도:", data.length, "개");
    
    let loadedCount = 0;
    data.forEach(item => {
      try {
        const range = deserializeTextPosition(item.textPosition);
        if (range && range.toString() === item.text) {
          createHighlight(range, item.color, item.comment);
          loadedCount++;
        }
      } catch (e) {
        console.log("개별 로드 실패:", e);
      }
    });
    
    console.log("로드 완료:", loadedCount, "개");
  } catch (e) {
    console.log("로드 실패:", e);
  }
}

function exportHighlights() {
  return Array.from(highlights.values()).map(hl => ({
    id: hl.id,
    url: window.location.href,
    textPosition: hl.textPosition,
    comment: hl.comment,
    color: hl.color,
    text: hl.text,
    timestamp: new Date().toISOString()
  }));
}

function importHighlights(dataArray) {
  // 기존 하이라이트 모두 제거
  Array.from(highlights.keys()).forEach(removeHighlight);
  
  // 새 하이라이트 생성
  dataArray.forEach(item => {
    if (item.textPosition) {
      const range = deserializeTextPosition(item.textPosition);
      if (range) {
        createHighlight(range, item.color, item.comment);
      }
    }
  });
}

// ===== 초기화 =====

function initialize() {
  console.log("확장 프로그램 초기화");
  
  // 상태 복원
  const savedState = localStorage.getItem("highlightActive");
  isActive = savedState === "true";
  
  // background script와 동기화
  try {
    chrome.runtime.sendMessage({ action: "getState" }, (response) => {
      if (!chrome.runtime.lastError && response) {
        isActive = response.isActive;
      }
    });
  } catch (e) {
    console.log("background script 통신 불가");
  }
}

// ===== 메시지 리스너 =====

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch(request.action) {
    case "start":
      isActive = true;
      sendResponse({ success: true });
      break;
    case "stop":
      isActive = false;
      hideTooltip();
      sendResponse({ success: true });
      break;
    case "getHighlights":
      sendResponse({ data: exportHighlights() });
      break;
    case "loadHighlights":
      importHighlights(request.data);
      sendResponse({ success: true });
      break;
  }
  return true;
});

// ===== 초기화 실행 =====

function waitAndLoad() {
  if (document.readyState === 'complete') {
    initialize();
    setTimeout(loadHighlights, 300); // 지연 시간 증가
  } else {
    setTimeout(waitAndLoad, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(waitAndLoad, 50));
} else {
  setTimeout(waitAndLoad, 50);
}

// 페이지 언로드 시 저장
window.addEventListener('beforeunload', saveHighlights);