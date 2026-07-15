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
