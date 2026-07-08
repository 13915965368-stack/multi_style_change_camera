import { CameraManager } from './camera.js';
import { HandDetector } from './detector.js';
import { FrameRenderer } from './frameRenderer.js';
import { STYLES, processFrameRegion, initStyleTransfer, isStyleTransferReady } from './styleTransfer.js';
import { recognizeHandGesture } from './gestureUtils.js';

const video = document.getElementById('webcam');
const canvas = document.getElementById('preview-canvas');
const statusText = document.getElementById('status-text');
const captureBtn = document.getElementById('capture-btn');
const galleryGrid = document.getElementById('gallery-grid');
const styleButtons = document.querySelectorAll('.style-btn');
const cameraSelect = document.getElementById('camera-select');

const camera = new CameraManager(video);
const renderer = new FrameRenderer(canvas);
const detector = new HandDetector();

// 新手引导弹窗：首次访问展示，localStorage 记忆
const onboardingOverlay = document.getElementById('onboarding-overlay');
const onboardingStart = document.getElementById('onboarding-start');
if (onboardingOverlay && onboardingStart) {
  try {
    if (!localStorage.getItem('onboardingDone')) {
      onboardingOverlay.classList.remove('hidden');
    }
  } catch (e) { /* localStorage 不可用时静默跳过 */ }
  onboardingStart.addEventListener('click', () => {
    onboardingOverlay.classList.add('hidden');
    try { localStorage.setItem('onboardingDone', '1'); } catch (e) {}
  });
}

let currentStyle = 'candy';
let currentFrame = null;
let currentLandmarks = null;
let smoothedFrame = null;
const SMOOTH_ALPHA = 0.6;
let isRunning = false;
let captureTriggered = false;  // 拍照状态锁：触发一次后必须松开才能再触发
let lockedFrame = null;      // 锁定的取景框（非null表示已锁定）
let lockTriggered = false;   // 锁定toggle状态锁
let lockHoldFrames = 0;      // 单手三指收拢连续帧计数（防抖）
const LOCK_HOLD_REQUIRED = 5; // 触发锁定/解锁需连续保持的帧数(~150ms)
let lastSendTime = 0;
const SEND_INTERVAL = 33; // ~30fps

async function populateCameraSelect() {
  const devices = await camera.getDevices();
  cameraSelect.innerHTML = '';
  if (devices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未检测到摄像头';
    cameraSelect.appendChild(option);
    cameraSelect.disabled = true;
    return null;
  }

  devices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label;
    cameraSelect.appendChild(option);
  });
  cameraSelect.disabled = false;
  // 默认选择第一个设备
  cameraSelect.selectedIndex = 0;
  return devices[0].deviceId;
}

async function init() {
  try {
    const selectedDeviceId = await populateCameraSelect();

    if (selectedDeviceId) {
      await camera.start(selectedDeviceId);
    } else {
      statusText.textContent = '未检测到可用摄像头，尝试默认摄像头...';
      await camera.start();
    }

    await detector.init();

    const { width, height } = camera.getVideoSize();
    renderer.resize(width, height);

    // 后台加载风格迁移模型（不阻塞主循环，加载完自动切换到 AI 风格化）
    statusText.textContent = '正在加载 AI 风格迁移模型...';
    initStyleTransfer()
      .then(() => {
        console.log('[stylize] model ready');
      })
      .catch((err) => {
        console.error('[stylize] model init failed:', err);
      });

    statusText.textContent = '请双手比出取景框';
    isRunning = true;
    runLoop();
  } catch (err) {
    console.error(err);
    statusText.textContent = `摄像头启动失败: ${err.message}`;
  }
}

function computeViewfinderFrame(hands) {
  if (!hands || hands.length !== 2) return null;

  const [left, right] = hands;

  const p1 = left[8];   // left index tip
  const p2 = right[8];  // right index tip
  const p3 = right[4];  // right thumb tip
  const p4 = left[4];   // left thumb tip

  if (!p1 || !p2 || !p3 || !p4) return null;

  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 0.06 || height < 0.04) return null;
  const aspectRatio = width / height;
  if (aspectRatio < 0.5 || aspectRatio > 3.5) return null;

  return {
    x: minX,
    y: minY,
    width,
    height,
    corners: [p1, p2, p3, p4]
  };
}

async function runLoop() {
  if (!isRunning) return;

  const now = performance.now();
  const videoReady = video.videoWidth > 0 && video.videoHeight > 0;
  if (videoReady && now - lastSendTime > SEND_INTERVAL) {
    const results = detector.detect(video);
    currentLandmarks = results?.landmarks || null;

    // 识别每只手的手势
    const gestures = currentLandmarks ? currentLandmarks.map(recognizeHandGesture) : [];
    const threeFoldedCount = gestures.filter(g => g === 'threeFolded').length;

    // 双手三指收拢拍照
    if (threeFoldedCount === 2 && !captureTriggered) {
      capturePhoto();
      captureTriggered = true;
    } else if (threeFoldedCount !== 2) {
      captureTriggered = false;
    }

    // 锁定/解锁（toggle，需双手同时在场 + 单手三指收拢，连续5帧防抖）
    // 单手在场时不触发锁定操作，避免框被误清消失
    const handsPresent = currentLandmarks ? currentLandmarks.length : 0;
    const canToggleLock = handsPresent === 2 && threeFoldedCount === 1;
    if (canToggleLock) {
      if (!lockTriggered) {
        lockHoldFrames++;
        if (lockHoldFrames >= LOCK_HOLD_REQUIRED) {
          if (lockedFrame) {
            lockedFrame = null;  // 解锁
          } else if (smoothedFrame) {
            lockedFrame = { ...smoothedFrame };  // 锁定当前框
          }
          lockTriggered = true;
        }
      }
    } else {
      lockHoldFrames = 0;
      lockTriggered = false;
    }

    const rawFrame = computeViewfinderFrame(currentLandmarks);

    if (rawFrame) {
      if (smoothedFrame) {
        smoothedFrame = {
          x: smoothedFrame.x + (rawFrame.x - smoothedFrame.x) * SMOOTH_ALPHA,
          y: smoothedFrame.y + (rawFrame.y - smoothedFrame.y) * SMOOTH_ALPHA,
          width: smoothedFrame.width + (rawFrame.width - smoothedFrame.width) * SMOOTH_ALPHA,
          height: smoothedFrame.height + (rawFrame.height - smoothedFrame.height) * SMOOTH_ALPHA,
          corners: rawFrame.corners
        };
      } else {
        smoothedFrame = { ...rawFrame };
      }
    } else {
      smoothedFrame = null;
    }

    // currentFrame 优先用锁定框，否则用手势框
    currentFrame = lockedFrame || smoothedFrame;

    lastSendTime = now;

    statusText.textContent = lockedFrame
      ? '框已锁定（单手三指收拢解锁）'
      : (currentFrame ? '已识别手势取景框' : '请双手比出取景框');
  }

  renderer.clear();
  renderer.drawDimMask(currentFrame);

  if (currentFrame) {
    processFrameRegion(video, currentFrame, currentStyle, renderer.ctx);
  }

  renderer.drawHandLandmarks(currentLandmarks);
  renderer.drawFrameBorder(currentFrame, !!lockedFrame);

  requestAnimationFrame(runLoop);
}

function capturePhoto() {
  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = video.videoWidth;
  captureCanvas.height = video.videoHeight;
  const ctx = captureCanvas.getContext('2d');

  // Draw mirrored video frame
  ctx.translate(captureCanvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 框内用 AI 风格化（复用 processFrameRegion，用最新推理结果）
  if (currentFrame) {
    processFrameRegion(video, currentFrame, currentStyle, ctx);

    const left = (1 - currentFrame.x - currentFrame.width) * captureCanvas.width;
    const top = currentFrame.y * captureCanvas.height;
    const w = currentFrame.width * captureCanvas.width;
    const h = currentFrame.height * captureCanvas.height;

    // Draw frame border on final image
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(left, top, w, h);
  }

  const img = document.createElement('img');
  img.src = captureCanvas.toDataURL('image/jpeg', 0.92);
  galleryGrid.prepend(img);
}

styleButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    styleButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = btn.dataset.style;
  });
});

captureBtn.addEventListener('click', capturePhoto);

cameraSelect.addEventListener('change', async () => {
  const deviceId = cameraSelect.value;
  if (!deviceId) return;

  try {
    statusText.textContent = '正在切换摄像头...';
    camera.stop();
    await camera.start(deviceId);

    const { width, height } = camera.getVideoSize();
    renderer.resize(width, height);

    statusText.textContent = currentFrame ? '已识别手势取景框' : '请双手比出取景框';
  } catch (err) {
    console.error(err);
    statusText.textContent = `切换摄像头失败: ${err.message}`;
  }
});

init();
