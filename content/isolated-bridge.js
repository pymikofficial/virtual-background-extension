// Runs in the ISOLATED world (has chrome.* APIs, no direct access to the
// page's own JS globals). Its only job is to read the extension's saved
// settings and web_accessible_resource URLs, then relay them into the
// MAIN-world pipeline script via postMessage, since MAIN-world content
// scripts cannot call chrome.storage or chrome.runtime.getURL directly.
(() => {
  const CHANNEL = "__vbe_state__";
  const DEFAULTS = { enabled: true, blurIntensity: 12 };

  const assets = {
    wasmBase: chrome.runtime.getURL("lib/mediapipe/wasm"),
    modelPath: chrome.runtime.getURL("lib/mediapipe/models/selfie_segmenter.tflite"),
    visionBundle: chrome.runtime.getURL("lib/mediapipe/vision_bundle.mjs"),
  };

  function post(payload) {
    window.postMessage({ channel: CHANNEL, ...payload }, "*");
  }

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    post({ state: stored, assets });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const patch = {};
    if ("enabled" in changes) patch.enabled = changes.enabled.newValue;
    if ("blurIntensity" in changes) patch.blurIntensity = changes.blurIntensity.newValue;
    if (Object.keys(patch).length) post({ state: patch });
  });
})();
