export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
  }

  async getDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `摄像头 ${i + 1}`
      }));
  }

  async start(deviceId = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器或环境不支持摄像头访问。请使用 Chrome/Edge/Safari 最新版，并通过 localhost 或 HTTPS 访问。');
    }

    const videoConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user'
    };
    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });
    this.video.srcObject = this.stream;
    const loadPromise = new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
      };
      this.video.onplaying = () => {
        resolve();
      };
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('摄像头启动超时，请检查权限和设备')), 8000);
    });
    return Promise.race([loadPromise, timeoutPromise]);
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  getVideoSize() {
    return {
      width: this.video.videoWidth,
      height: this.video.videoHeight
    };
  }
}
