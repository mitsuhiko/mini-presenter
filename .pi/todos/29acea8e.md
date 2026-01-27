{
  "id": "29acea8e",
  "title": "Injected script for display tab",
  "tags": [
    "phase-1",
    "mvp"
  ],
  "status": "closed",
  "created_at": "2026-01-27T08:57:57.229Z"
}

# Injected Script (client/injected.js)

Script that gets injected into the presentation HTML. Handles:
1. WebSocket connection to server
2. Hash change detection and reporting
3. Receiving navigation commands
4. Dispatching keyboard events
5. Detecting optional presentation API

## Core Functionality

```javascript
// client/injected.js

(function() {
  const ws = new WebSocket(`ws://${location.host}/_/ws`);
  
  // Register as display
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'register', role: 'display' }));
    reportState();
  };
  
  // Report current state
  function reportState() {
    const slideId = getSlideId();
    ws.send(JSON.stringify({ type: 'state', slideId, hash: location.hash }));
  }
  
  // Get slide ID (API or hash fallback)
  function getSlideId() {
    if (window.miniPresenter?.getCurrentSlide) {
      return window.miniPresenter.getCurrentSlide();
    }
    return location.hash || '#';
  }
  
  // Watch for hash changes
  window.addEventListener('hashchange', reportState);
  
  // Handle incoming commands
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'key') {
      dispatchKey(msg.key);
    } else if (msg.type === 'navigate') {
      handleNavigate(msg.action);
    }
  };
  
  // Dispatch keyboard event
  function dispatchKey(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }
  
  // Navigate using API or keyboard fallback
  function handleNavigate(action) {
    if (window.miniPresenter?.[action]) {
      window.miniPresenter[action]();
    } else {
      const keyMap = { next: 'ArrowRight', prev: 'ArrowLeft' };
      dispatchKey(keyMap[action] || action);
    }
  }
})();
```

## Presentation API Detection
If `window.miniPresenter` exists, use it for:
- `getCurrentSlide()` - get current slide ID
- `next()`, `prev()` - navigation
- `getNotes(slideId)` - speaker notes (future)

## Tasks
- [ ] Create client/injected.js with WebSocket connection
- [ ] Implement hash-based state detection
- [ ] Implement keyboard event dispatching
- [ ] Add presentation API detection
- [ ] Handle reconnection on WebSocket close
- [ ] Test with basic HTML presentation

## Depends on
- TODO-ee983ff6 (WebSocket hub)
