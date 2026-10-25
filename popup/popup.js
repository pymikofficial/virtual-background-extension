const DEFAULTS = { enabled: true, blurIntensity: 12 };

const toggle = document.getElementById("enabledToggle");
const slider = document.getElementById("blurSlider");
const blurValue = document.getElementById("blurValue");
const statusDot = document.getElementById("statusDot");

function reflect(state) {
  toggle.setAttribute("aria-checked", String(state.enabled));
  statusDot.classList.toggle("off", !state.enabled);
  slider.value = state.blurIntensity;
  blurValue.textContent = `${state.blurIntensity}px`;
  slider.disabled = !state.enabled;
}

chrome.storage.sync.get(DEFAULTS, (stored) => reflect(stored));

toggle.addEventListener("click", () => {
  const next = toggle.getAttribute("aria-checked") !== "true";
  chrome.storage.sync.set({ enabled: next }, () => {
    reflect({ enabled: next, blurIntensity: Number(slider.value) });
  });
});

slider.addEventListener("input", () => {
  blurValue.textContent = `${slider.value}px`;
});

slider.addEventListener("change", () => {
  chrome.storage.sync.set({ blurIntensity: Number(slider.value) });
});

// ---- one-time rating prompt ----
// Shown only after 3 real blurred calls, never again once the person rates
// or says no thanks. "Later" waits another 10 calls. Counts stay on device.
const REVIEW_URL = "https://chromewebstore.google.com/detail/jdlienijidakhdofpcinjdomgpbecgle/reviews";
const RATE_AFTER = 3;
const SNOOZE_CALLS = 10;
const rateCard = document.getElementById("rateCard");

function openReview() {
  chrome.storage.local.set({ rateStatus: "rated" });
  chrome.tabs.create({ url: REVIEW_URL });
  window.close();
}

chrome.storage.local.get({ useCount: 0, rateStatus: "pending", rateSnoozeUntil: 0 }, (s) => {
  const due = s.rateStatus === "pending" && s.useCount >= RATE_AFTER && s.useCount >= s.rateSnoozeUntil;
  rateCard.hidden = !due;
  document.getElementById("rateLater").addEventListener("click", () => {
    chrome.storage.local.set({ rateSnoozeUntil: s.useCount + SNOOZE_CALLS });
    rateCard.hidden = true;
  });
});

document.getElementById("rateYes").addEventListener("click", openReview);
document.getElementById("rateLink").addEventListener("click", (e) => { e.preventDefault(); openReview(); });
document.getElementById("rateNo").addEventListener("click", () => {
  chrome.storage.local.set({ rateStatus: "dismissed" });
  rateCard.hidden = true;
});
