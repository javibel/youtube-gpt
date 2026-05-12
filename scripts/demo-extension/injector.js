// Injects demo-mode.js into the MAIN world via a <script> tag
// This runs in the content script (isolated world) at document_start
const s = document.createElement('script');
s.src = chrome.runtime.getURL('demo-mode.js');
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);
