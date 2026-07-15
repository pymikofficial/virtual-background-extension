# Blur Background — Free Virtual Camera

A free, no-watermark, no-sign-in Chrome extension that blurs your webcam
background on any site that uses `getUserMedia()`: Google Meet, Zoom's web
client, interview/assessment tools, whatever. Not tied to one platform.

**Status: MVP, unpacked/developer-mode only. Not yet published to the Chrome
Web Store. The core pipeline has been verified with a synthetic video source
(see [What's been verified](#whats-been-verified-vs-what-still-needs-a-real-camera-test)
below) but still needs a real-camera, real-site pass before it's demo-ready.**

## Why

Built after a real pain point: a mosquito net and a cluttered room were
visible in the background during a Coderbyte video interview assessment,
with no option to re-record. Went looking for a background-blur extension
to fix it for next time and came up short: the free options are either
watermarked, low-rated, or gate the actual blur behind a subscription.
`webcameffects.app` is the closest reference product studied here, but its
"free tier" carries a visible watermark.

The bet with this extension: background blur is table stakes, not a premium
feature. No watermark, ever. No sign-in required for the core feature. That's
the whole differentiator.

## Scope (v1 / MVP)

1. Background blur with an intensity slider (0–20px)
2. A global on/off toggle
3. Works as a virtual-camera layer on any site doing `getUserMedia()` video,
   not wired to a specific platform's SDK

**Explicitly out of scope for v1** (parked, see [What's next](#whats-next--parked-for-v2) below):
background replace/custom images, beautification, color correction, smart
zoom, lower-third overlays, Giphy/emoji, built-in recording, quality presets.

## How it works

Manifest V3 extension, no background service worker, two content scripts:

- **`content/isolated-bridge.js`** (isolated world) — reads the saved toggle
  state and blur intensity from `chrome.storage.sync`, resolves the
  extension's own web-accessible-resource URLs (the MediaPipe wasm runtime,
  model file, and vision bundle), and relays both into the page via
  `window.postMessage`. This script exists only because a MAIN-world content
  script cannot call `chrome.storage` or `chrome.runtime.getURL` directly.

- **`content/camera-pipeline.js`** (**MAIN world**, i.e. it runs in the
  actual page's own JS context) — overrides
  `navigator.mediaDevices.getUserMedia` before the page's own call resolves.
  When the page asks for video, this script:
  1. Calls the real, unpatched `getUserMedia` to get the actual camera
     stream.
  2. Feeds that stream into a hidden `<video>` element.
  3. Runs [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)'s
     `ImageSegmenter` (selfie segmentation model) on each frame to get a
     person/background mask.
  4. Composites a blurred full-frame background with a sharp, mask-cut-out
     copy of the person on top, onto a `<canvas>`.
  5. Returns `canvas.captureStream()` (with the original audio track
     reattached) to the calling site — the site sees this processed stream,
     never the raw webcam feed.
  6. If segmentation fails to load for any reason, it falls back to the
     unmodified real camera stream rather than breaking the call.

  Toggling blur off does not renegotiate the stream (that would require the
  calling page to re-request the camera) — it just stops running the
  segmentation/blur pass on each frame, so the canvas shows the raw feed
  instead. Stopping the returned track also stops the real underlying camera
  track, so the camera light won't stay on after the site hangs up.

- **`popup/popup.html` + `popup.js`** — single slider + toggle, writes to
  `chrome.storage.sync`.

### Why MediaPipe Tasks Vision over TensorFlow.js BodyPix

Checked both for MV3/extension-context compatibility before committing:

- BodyPix is unmaintained (last meaningful update years ago), noticeably
  heavier, and less accurate than MediaPipe's dedicated selfie segmentation
  model.
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) ships a purpose-built
  selfie segmenter, is actively maintained, and — critically for this
  architecture — runs entirely inside the MAIN-world content script (i.e.
  inside the *page's* JS context, not the extension's service worker), so
  MV3 service-worker restrictions don't actually apply to it. The wasm
  runtime, loader, and the `.tflite` model are vendored locally under
  `lib/mediapipe/` and declared as `web_accessible_resources` rather than
  fetched from a CDN at runtime — this avoids remote code execution (a
  Chrome Web Store policy concern) and avoids a host page's CSP blocking a
  cross-origin fetch to Google's CDN.

### The hard part: virtual camera output without a real virtual-camera API

Chrome extensions have no first-class "publish a virtual webcam" API. The
approach here — override `getUserMedia` in the page's own context via a
MAIN-world content script, and hand back a `canvas.captureStream()` instead
of the real track — is the current best-practice pattern for this, but it
has a real limitation worth being upfront about: because the override runs
inside the *host page's* JS context, it's subject to that page's Content
Security Policy, not the extension's. A site with a very strict CSP
(`script-src`/`connect-src` that blocks `chrome-extension://` origins)
could in principle block the dynamic `import()` of the vision bundle or the
`fetch()` of the wasm/model files. This wasn't hit in testing (see below),
but hasn't been tested against Meet's or Zoom's actual production CSP
headers yet either.

## Permissions

- `storage` — save the toggle and blur-intensity setting.
- `host_permissions: <all_urls>` — required so the content scripts can run
  on any site the user might be on a call in, matching "works on any
  getUserMedia site," not one platform.

That's it. No `camera` permission exists in the MV3 permission model —
camera access is a standard web-platform permission the *site* requests via
`getUserMedia()`, granted per-site by the browser exactly like it would be
without this extension installed. This extension never requests or holds
camera access itself; it only intercepts the *result* of the page's own
already-granted call.

## Installation (unpacked, developer mode)

1. Clone this repo.
2. Go to `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked**, select this folder.
4. The popup (extension icon) shows a blur toggle and intensity slider.

Not yet on the Chrome Web Store.

## What's been verified vs. what still needs a real-camera test

**Verified in this build session:**

- `manifest.json` is valid JSON and uses only currently-supported MV3 keys
  (including `"world": "MAIN"` on a declarative content script, supported
  since Chrome 111).
- The popup's own DOM/JS logic (toggle flips state, disables the slider
  when off, slider updates its live label and persists to
  `chrome.storage.sync`, a freshly-reopened popup reflects persisted state)
  — tested with Playwright against `popup.html` with a mocked
  `chrome.storage` API.
- **The actual segmentation + blur pipeline runs correctly end-to-end** —
  tested by loading `camera-pipeline.js` in a real Chromium page, mocking
  `getUserMedia` to return a synthetic animated canvas stream (standing in
  for a webcam) instead of a real camera, and confirming: the override
  installs, `getUserMedia` returns a distinct canvas-captured stream (not
  the raw input), MediaPipe's `ImageSegmenter` loads with the GPU delegate,
  and the output frames are continuously changing (i.e. actively
  segmenting and compositing in real time, not frozen or blank). No console
  errors.
- All JS files pass `node --check` (syntax validity).

**Not verified — genuinely needs Soumik, in person, with a real camera:**

- Loading the unpacked extension via `chrome://extensions` itself.
  Automating this specifically was attempted and hit a real wall: modern
  branded Google Chrome (tested against Chrome 150) silently ignores the
  `--load-extension` command-line flag on the stable channel — this is a
  deliberate Chrome security change to stop CLI-driven silent extension
  sideloading, not a bug in this extension. The `Extensions.loadUnpacked`
  CDP method exists in principle but requires a debug flag
  (`--enable-unsafe-extension-debugging`) to enable it, and using that flag
  to route around Chrome's own anti-sideloading protection was judged not
  reasonable to do unilaterally without your say-so. So: **step 2 of
  Installation above (Load unpacked, confirm it appears in the list with no
  errors) needs to actually happen in your hands.**
- Real webcam permission prompt and real webcam feed through the pipeline.
- Actual behavior on Google Meet, Zoom web, and Coderbyte-style tools
  specifically — the CSP concern above is real but untested against their
  actual headers.
- Whether the GPU delegate (used in the synthetic test) also succeeds on
  your actual hardware/driver combo, and whether the CPU fallback path
  (used automatically if GPU init throws) is fast enough to feel smooth on
  a real face at 30fps.

### Manual test steps (do this before calling it demo-ready)

1. Load unpacked per Installation above. Confirm no red "Errors" button on
   the extension's card in `chrome://extensions`.
2. Open the popup, confirm blur is on by default and the slider defaults to
   12px.
3. Open Google Meet (or `zoom.us` web client), start a camera preview.
4. Confirm your background is visibly blurred and you're still sharp.
5. Open the extension popup, drag the slider — confirm the blur intensity
   changes live in the call preview.
6. Toggle blur off — confirm the feed returns to your normal unblurred
   camera without breaking the call.
7. End the call, confirm the camera indicator light turns off (i.e. the
   real track was actually stopped, not just hidden).
8. Repeat on a second site (e.g. a Coderbyte-style assessment tool) to
   confirm it isn't Meet-specific.

## What's next (parked for v2)

- Background replacement with custom images
- Beautification / color correction
- Smart zoom / auto-framing
- Lower-third overlays
- Giphy / emoji overlays
- Built-in recording
- Speed/quality presets

None of this is built yet, on purpose — the MVP ships blur-only first.

## Third-party code

`lib/mediapipe/` vendors the wasm runtime, loader, and selfie-segmentation
model from Google's [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision)
package (Apache-2.0), included locally rather than loaded from a CDN so the
extension doesn't execute remote code at runtime.

Built by [Soumik Chatterjee](https://cosmik.work).
