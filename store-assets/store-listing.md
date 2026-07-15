# Chrome Web Store listing — draft copy

Status: drafts for Soumik's review/final wording, not yet submitted.

## Privacy policy URL

https://cosmik.work/privacy-virtual-background.html

(Hosted on cosmik.work, Netlify-deployed. Live shortly after the cosmik.work
`main` branch push that added this page — allow a minute or two for Netlify
to finish deploying before pasting this into the Dashboard form.)

## Short description (pick one, under 132 chars)

1. "Free background blur for video calls. No sign-in, no watermark, runs entirely in your browser." (94 chars) — currently used in manifest.json
2. "Blur your background on any video call. Private, free, no account needed." (76 chars)
3. "One-click background blur for video calls. No watermark, no sign-in, 100% local." (83 chars)

## Full description (draft, not final)

Built after a real embarrassing moment: a cluttered background caught on
camera during a video interview assessment, with no way to fix it live and
no re-record option. Went looking for a background-blur extension and came
up short — the free options are watermarked, low-rated, or gate the actual
blur behind a subscription.

This extension does one thing well: blur your background on any video call
site, one click, with an adjustable intensity slider and an instant on/off
toggle. It's not tied to a specific platform — it works anywhere a site
requests your camera, including Google Meet, Zoom's web client, and
interview/assessment tools.

No sign-in, no account, no watermark. There's no paid tier gating the core
feature — background blur should be table stakes, not a premium add-on.

Everything runs entirely on-device, in your own browser, using Google's
MediaPipe on-device machine learning. Your video is never uploaded,
recorded, or sent anywhere — it never leaves your device.

## Screenshot

`store-assets/screenshot-1280x800.png` — real-camera capture, exact
1280x800, ready to upload as the Store listing screenshot.

`store-assets/before-after.png` — wide reference version, for later reuse
on the cosmik.work tool card (not for the Store submission itself).

## Submission package

`virtual-background-extension-v0.1.0.zip` (built in an earlier session,
still valid — see repo root or wherever it was saved locally). Contains
only `manifest.json` (at zip root), `content/`, `icons/`, `lib/`, `popup/`.
Does not include the privacy policy or screenshots — those are separate
Dashboard form uploads, not part of the extension bundle.
