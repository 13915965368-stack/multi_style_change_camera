// 风格定义：ONNX fast_neural_style 模型 key（onnx/models 仓库仅提供这 5 个 opset-9 模型）
const STYLE_KEYS = ['candy', 'mosaic', 'udnie', 'pointilism', 'rain-princess'];

// 模型路径（本地，规避 jsdelivr LFS 指针问题与 COEP 跨源限制）
const MODEL_URL = (key) => `models/${key}-9.onnx`;

// 兼容 CSS 滤镜时代的外部引用（兜底与 UI 显示）
export const STYLES = {
  candy: { name: '糖果梦幻', filter: 'saturate(1.3) hue-rotate(-10deg) brightness(1.05)' },
  mosaic: { name: '马赛克拼贴', filter: 'contrast(1.2) saturate(0.9) brightness(1.1)' },
  udnie: { name: '抽象艺术', filter: 'contrast(1.15) saturate(1.4) hue-rotate(15deg)' },
  pointilism: { name: '点彩派', filter: 'saturate(1.25) contrast(1.1) brightness(1.05)' },
  'rain-princess': { name: '雨中公主', filter: 'saturate(1.1) contrast(1.15) brightness(0.98) hue-rotate(-5deg)' }
};

// ONNX Runtime 会话
const sessions = {};
let isModelReady = false;

// 异步推理状态：最新一帧策略
let pendingInfer = null;
let latestStylized = null;

const INFER_SIZE = 224;
const CHANNEL_SIZE = INFER_SIZE * INFER_SIZE; // 单通道像素数

/**
 * 初始化风格迁移模型，加载 5 个 fast_neural_style ONNX 会话。
 * 依赖全局 ort（onnxruntime-web UMD）。
 */
export async function initStyleTransfer() {
  if (typeof ort === 'undefined') {
    throw new Error('ort 全局变量未定义，请确认 ort.js 已加载');
  }

  // 配置 wasm 路径
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';

  // 容错加载：单个模型失败不影响其他模型（allSettled）
  const results = await Promise.allSettled(
    STYLE_KEYS.map(async (key) => {
      const resp = await fetch(MODEL_URL(key));
      if (!resp.ok) throw new Error(`模型下载失败: ${key} (${resp.status})`);
      const buf = await resp.arrayBuffer();
      sessions[key] = await ort.InferenceSession.create(buf, {
        executionProviders: ['webgpu', 'wasm']
      });
      console.log(`[stylize] ${key} 加载成功`);
    })
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[stylize] ${STYLE_KEYS[i]} 加载失败:`, r.reason);
    }
  });
  isModelReady = true;
}

export function isStyleTransferReady() {
  return isModelReady;
}

/**
 * 对 source 的框内区域应用 AI 风格迁移，绘制到 outputCtx。
 * source 是未镜像的 video 原始帧，输出 canvas 也未做 CSS 镜像。
 * 采用"最新一帧"异步策略：推理不阻塞渲染循环，推理期间用原始帧兜底。
 */
export function processFrameRegion(source, frame, styleKey, outputCtx) {
  if (!frame) return;

  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;

  const left = (1 - frame.x - frame.width) * sourceWidth;
  const top = frame.y * sourceHeight;
  const w = frame.width * sourceWidth;
  const h = frame.height * sourceHeight;

  // 未就绪时用 CSS 滤镜兜底
  if (!isModelReady || !sessions[styleKey]) {
    drawWithCssFilter(source, frame, styleKey, outputCtx, left, top, w, h);
    return;
  }

  // 裁剪 + 镜像到临时 canvas（224x224）
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = INFER_SIZE;
  tempCanvas.height = INFER_SIZE;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.save();
  tempCtx.translate(INFER_SIZE, 0);
  tempCtx.scale(-1, 1);
  tempCtx.drawImage(source, frame.x * sourceWidth, top, w, h, 0, 0, INFER_SIZE, INFER_SIZE);
  tempCtx.restore();

  // 发起异步推理（上一帧没跑完就跳过，避免堆积）
  if (!pendingInfer) {
    pendingInfer = (async () => {
      try {
        // 取 ImageData（224x224 RGBA）
        const imageData = tempCtx.getImageData(0, 0, INFER_SIZE, INFER_SIZE);
        const rgba = imageData.data;

        // RGBA -> NCHW float32 [1,3,224,224]，RGB 顺序，值范围 [0,255] 不归一化
        const nchw = new Float32Array(1 * 3 * CHANNEL_SIZE);
        for (let i = 0; i < CHANNEL_SIZE; i++) {
          nchw[i] = rgba[i * 4];                       // R -> channel 0
          nchw[CHANNEL_SIZE + i] = rgba[i * 4 + 1];    // G -> channel 1
          nchw[2 * CHANNEL_SIZE + i] = rgba[i * 4 + 2]; // B -> channel 2
        }

        const input = new ort.Tensor('float32', nchw, [1, 3, INFER_SIZE, INFER_SIZE]);
        const out1 = await sessions[styleKey].run({ input1: input });
        // 叠加第二次推理：把第一次输出喂回模型，风格更浓
        const out2 = await sessions[styleKey].run({ input1: out1.output1 });

        // 输出 NCHW -> RGBA Uint8ClampedArray，clip 到 [0,255]
        const outData = out2.output1.data;
        const rgbaOut = new Uint8ClampedArray(CHANNEL_SIZE * 4);
        for (let i = 0; i < CHANNEL_SIZE; i++) {
          rgbaOut[i * 4] = Math.max(0, Math.min(255, outData[i]));
          rgbaOut[i * 4 + 1] = Math.max(0, Math.min(255, outData[CHANNEL_SIZE + i]));
          rgbaOut[i * 4 + 2] = Math.max(0, Math.min(255, outData[2 * CHANNEL_SIZE + i]));
          rgbaOut[i * 4 + 3] = 255;
        }

        latestStylized = { data: rgbaOut, width: INFER_SIZE, height: INFER_SIZE };
      } catch (err) {
        console.error('[stylize] inference failed:', err);
      } finally {
        pendingInfer = null;
      }
    })();
  }

  // 有最新结果就贴回
  if (latestStylized) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = latestStylized.width;
    outCanvas.height = latestStylized.height;
    const octx = outCanvas.getContext('2d');
    const imgData = new ImageData(latestStylized.data, latestStylized.width, latestStylized.height);
    octx.putImageData(imgData, 0, 0);
    outputCtx.drawImage(outCanvas, left, top, w, h);
  } else {
    // 兜底：画原始帧（带镜像）
    outputCtx.save();
    outputCtx.translate(left + w, 0);
    outputCtx.scale(-1, 1);
    outputCtx.drawImage(source, frame.x * sourceWidth, top, w, h, left, top, w, h);
    outputCtx.restore();
  }
}

/**
 * CSS 滤镜兜底（模型未就绪时使用）
 */
function drawWithCssFilter(source, frame, styleKey, outputCtx, left, top, w, h) {
  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.ceil(w);
  tempCanvas.height = Math.ceil(h);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.save();
  tempCtx.translate(tempCanvas.width, 0);
  tempCtx.scale(-1, 1);
  tempCtx.drawImage(source, frame.x * sourceWidth, top, w, h, 0, 0, w, h);
  tempCtx.restore();

  outputCtx.save();
  outputCtx.filter = STYLES[styleKey]?.filter || STYLES.candy.filter;
  outputCtx.drawImage(tempCanvas, left, top, w, h);
  outputCtx.restore();
}

/**
 * 对指定 canvas 的指定区域应用风格滤镜（CSS 滤镜版本，用于拍照兜底）。
 */
export function applyStyleFilter(ctx, x, y, width, height, styleKey) {
  const style = STYLES[styleKey] || STYLES.candy;
  const sourceCanvas = ctx.canvas;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.ceil(width);
  tempCanvas.height = Math.ceil(height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);

  ctx.save();
  ctx.filter = style.filter;
  ctx.drawImage(tempCanvas, x, y, width, height);
  ctx.restore();
}
