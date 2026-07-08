import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/+esm';

export class HandDetector {
  constructor() {
    this.handLandmarker = null;
    this.isReady = false;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
    );
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2
    });
    this.isReady = true;
  }

  detect(videoElement) {
    if (!this.isReady || !this.handLandmarker) return null;
    return this.handLandmarker.detectForVideo(videoElement, performance.now());
  }
}
