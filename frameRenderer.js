export class FrameRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * 画框外半透明遮罩，框内保持透明，避免覆盖后续的风格化绘制。
   * 用 4 个矩形拼出框外区域，不再使用 clearRect。
   */
  drawDimMask(frame) {
    if (!frame) return;

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const left = (1 - frame.x - frame.width) * canvasWidth;
    const top = frame.y * canvasHeight;
    const w = frame.width * canvasWidth;
    const h = frame.height * canvasHeight;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    this.ctx.fillRect(0, 0, canvasWidth, top);
    this.ctx.fillRect(0, top + h, canvasWidth, canvasHeight - top - h);
    this.ctx.fillRect(0, top, left, h);
    this.ctx.fillRect(left + w, top, canvasWidth - left - w, h);
    this.ctx.restore();
  }

  /**
   * 画取景框边框和角标（不包含遮罩）。
   */
  drawFrameBorder(frame, locked = false) {
    if (!frame) return;

    const { x, y, width, height } = frame;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const left = (1 - x - width) * canvasWidth;
    const top = y * canvasHeight;
    const w = width * canvasWidth;
    const h = height * canvasHeight;

    this.ctx.save();

    const time = Date.now() / 1000;
    const pulse = 1 + Math.sin(time * 2.5) * 0.015;
    this.ctx.strokeStyle = locked ? 'rgba(0, 255, 102, 0.95)' : 'rgba(255, 255, 255, 0.92)';
    this.ctx.lineWidth = 3 * pulse;
    this.ctx.lineJoin = 'round';
    this.ctx.strokeRect(left, top, w, h);

    const cornerLength = Math.min(w, h) * 0.18;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    this.ctx.lineWidth = 2;
    this.drawCorner(left, top, cornerLength, cornerLength, 'tl');
    this.drawCorner(left + w, top, -cornerLength, cornerLength, 'tr');
    this.drawCorner(left, top + h, cornerLength, -cornerLength, 'bl');
    this.drawCorner(left + w, top + h, -cornerLength, -cornerLength, 'br');

    this.ctx.restore();
  }

  drawCorner(x, y, dx, dy, corner) {
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + dy);
    this.ctx.lineTo(x, y);
    this.ctx.lineTo(x + dx, y);
    this.ctx.stroke();
  }

  /**
   * 绘制识别到的手部关键点（21 个绿色小圆点）。
   * landmarks: 数组，每个元素 { x, y } 为归一化坐标 [0,1]。
   * 支持单手或多手（传入数组的数组）。
   */
  drawHandLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    const hands = Array.isArray(landmarks[0]) ? landmarks : [landmarks];
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    this.ctx.save();
    this.ctx.fillStyle = '#00ff66';
    const radius = Math.max(3, Math.min(canvasWidth, canvasHeight) * 0.006);

    for (const hand of hands) {
      if (!hand) continue;
      for (const point of hand) {
        if (!point) continue;
        // 镜像 x 坐标以匹配预览画面
        const cx = (1 - point.x) * canvasWidth;
        const cy = point.y * canvasHeight;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }
}
