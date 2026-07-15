// Runs in the MAIN world (the page's own JS context) so it can see and
// override `navigator.mediaDevices.getUserMedia` before the page's own call
// resolves. Has no access to chrome.* APIs — all extension state and
// web_accessible_resource URLs are handed to it by content/isolated-bridge.js
// (a separate ISOLATED-world content script) via window.postMessage.
(() => {
  if (window.__vbeInstalled) return;
  window.__vbeInstalled = true;

  const CHANNEL = "__vbe_state__";
  const state = { enabled: true, blurIntensity: 12 };
  let assets = null;
  let resolveAssets;
  const assetsReady = new Promise((resolve) => { resolveAssets = resolve; });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (data.state) Object.assign(state, data.state);
    if (data.assets && !assets) {
      assets = data.assets;
      resolveAssets(assets);
    }
  });

  const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  let segmenterPromise = null;
  function getSegmenter() {
    if (segmenterPromise) return segmenterPromise;
    segmenterPromise = (async () => {
      const a = await assetsReady;
      const { FilesetResolver, ImageSegmenter } = await import(a.visionBundle);
      const fileset = await FilesetResolver.forVisionTasks(a.wasmBase);
      const options = {
        baseOptions: { modelAssetPath: a.modelPath, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      };
      try {
        return await ImageSegmenter.createFromOptions(fileset, options);
      } catch (gpuErr) {
        console.warn("[BlurBackground] GPU delegate failed, falling back to CPU:", gpuErr);
        options.baseOptions.delegate = "CPU";
        return await ImageSegmenter.createFromOptions(fileset, options);
      }
    })();
    return segmenterPromise;
  }

  // Builds a processed MediaStream: real camera -> hidden <video> -> per-frame
  // segmentation -> blurred background composited behind the sharp person cut-out
  // -> canvas.captureStream(). Audio tracks from the real stream pass through
  // untouched.
  async function buildProcessedStream(realStream) {
    const realVideoTrack = realStream.getVideoTracks()[0];
    if (!realVideoTrack) return realStream;

    const sourceVideo = document.createElement("video");
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.srcObject = new MediaStream([realVideoTrack]);
    await sourceVideo.play().catch(() => {});
    await new Promise((resolve) => {
      if (sourceVideo.readyState >= 2) return resolve();
      sourceVideo.onloadedmetadata = () => resolve();
    });

    const width = sourceVideo.videoWidth || 640;
    const height = sourceVideo.videoHeight || 480;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext("2d", { alpha: false });

    const sharpCanvas = document.createElement("canvas");
    sharpCanvas.width = width;
    sharpCanvas.height = height;
    const sharpCtx = sharpCanvas.getContext("2d");

    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");

    let stopped = false;
    let segmenterReady = false;
    getSegmenter().then(() => { segmenterReady = true; }).catch((err) => {
      console.error("[BlurBackground] segmenter failed to load, output will be unblurred passthrough:", err);
    });

    function compositeWithMask(categoryMask) {
      const mw = categoryMask.width;
      const mh = categoryMask.height;
      const maskBytes = categoryMask.getAsUint8Array();

      if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
        maskCanvas.width = mw;
        maskCanvas.height = mh;
      }
      // This model's categoryMask encodes 0 = person ("selfie", the one
      // labeled class) and 255 = background — verified empirically against
      // the confidence mask (P(selfie) is 1.0 where categoryMask is 0, and
      // 0.0 where categoryMask is 255). That's the inverse of the generic
      // "category > 0" == foreground convention shown in MediaPipe's own
      // docs samples, so don't "simplify" this back to `!== 0`.
      const imageData = maskCtx.createImageData(mw, mh);
      for (let i = 0; i < maskBytes.length; i++) {
        const isPerson = maskBytes[i] === 0;
        const o = i * 4;
        imageData.data[o] = 255;
        imageData.data[o + 1] = 255;
        imageData.data[o + 2] = 255;
        imageData.data[o + 3] = isPerson ? 255 : 0;
      }
      maskCtx.putImageData(imageData, 0, 0);

      // Sharp (in-focus) copy of this frame.
      sharpCtx.clearRect(0, 0, width, height);
      sharpCtx.drawImage(sourceVideo, 0, 0, width, height);

      // Keep only the person pixels from the sharp copy, feathered slightly
      // at the edges so the cut-out doesn't look hard-edged.
      sharpCtx.save();
      sharpCtx.filter = "blur(2px)";
      sharpCtx.globalCompositeOperation = "destination-in";
      sharpCtx.drawImage(maskCanvas, 0, 0, width, height);
      sharpCtx.restore();

      // Blurred full frame as the background layer.
      const blurPx = Math.max(0, Number(state.blurIntensity) || 0);
      outCtx.save();
      outCtx.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";
      outCtx.drawImage(sourceVideo, 0, 0, width, height);
      outCtx.restore();

      // Sharp person on top.
      outCtx.drawImage(sharpCanvas, 0, 0, width, height);
    }

    function renderRaw() {
      outCtx.drawImage(sourceVideo, 0, 0, width, height);
    }

    function frameTick() {
      if (stopped) return;
      if (state.enabled && segmenterReady) {
        getSegmenter().then((segmenter) => {
          if (stopped) return;
          try {
            segmenter.segmentForVideo(sourceVideo, performance.now(), (result) => {
              if (stopped) return;
              if (result.categoryMask) {
                compositeWithMask(result.categoryMask);
                result.categoryMask.close && result.categoryMask.close();
              } else {
                renderRaw();
              }
            });
          } catch (err) {
            renderRaw();
          }
        });
      } else {
        renderRaw();
      }

      if ("requestVideoFrameCallback" in sourceVideo) {
        sourceVideo.requestVideoFrameCallback(frameTick);
      } else {
        requestAnimationFrame(frameTick);
      }
    }
    frameTick();

    const outStream = outCanvas.captureStream(30);
    realStream.getAudioTracks().forEach((t) => outStream.addTrack(t));

    const outVideoTrack = outStream.getVideoTracks()[0];
    const nativeStop = outVideoTrack.stop.bind(outVideoTrack);
    outVideoTrack.stop = () => {
      stopped = true;
      realVideoTrack.stop();
      nativeStop();
    };

    return outStream;
  }

  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const wantsVideo = !!(constraints && constraints.video);
    const realStream = await nativeGetUserMedia(constraints);
    if (!wantsVideo) return realStream;

    try {
      return await buildProcessedStream(realStream);
    } catch (err) {
      console.error("[BlurBackground] pipeline failed, using unmodified camera stream:", err);
      return realStream;
    }
  };
})();
