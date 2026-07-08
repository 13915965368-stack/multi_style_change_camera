// 手势识别工具 - 基于 MediaPipe HandLandmarker 21 关键点
// 可扩展手势定义表 GESTURES，新增手势只需在此表添加一条并在 recognizeHandGesture 中匹配

// 两点间平面距离（忽略 z，对朝向鲁棒）
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 识别单手五指伸直/弯曲状态
 * @param {Array<{x:number,y:number,z:number}>} landmarks - 21 关键点
 * @returns {{thumb:boolean,index:boolean,middle:boolean,ring:boolean,pinky:boolean}}
 *   true 表示该手指伸直
 */
export function detectFingerStates(landmarks) {
  const wrist = landmarks[0];

  // 食指/中指/无名指/小指：比较 tip-to-wrist 与 PIP-to-wrist 距离
  // 伸直时指尖更远离手腕
  const fingerExt = (tipIdx, pipIdx) => dist(landmarks[tipIdx], wrist) > dist(landmarks[pipIdx], wrist);

  // 拇指特殊：以食指 MCP 为掌心参考，比较 tip 与 IP 到该点距离
  const indexMcp = landmarks[5];
  const thumbExt =
    dist(landmarks[4], indexMcp) > dist(landmarks[3], indexMcp);

  return {
    thumb: thumbExt,
    index: fingerExt(8, 6),
    middle: fingerExt(12, 10),
    ring: fingerExt(16, 14),
    pinky: fingerExt(20, 18),
  };
}

/**
 * 手势定义表（可扩展）
 * 每个值为 (states) => boolean，输入 detectFingerStates 输出，返回是否匹配。
 * 后期加新手势只需在此表加一条 + 在 recognizeHandGesture 加匹配。
 */
export const GESTURES = {
  // 握拳 / 拍照：五指全弯
  fist: (s) => !s.thumb && !s.index && !s.middle && !s.ring && !s.pinky,
  // 三指收拢 / 锁定：拇指食指伸直，中/无名/小指弯曲
  threeFolded: (s) => s.thumb && s.index && !s.middle && !s.ring && !s.pinky,
  // 五指张开
  open: (s) => s.thumb && s.index && s.middle && s.ring && s.pinky,
};

/**
 * 识别单手手势
 * @param {Array<{x:number,y:number,z:number}>} landmarks - 21 关键点
 * @returns {'threeFolded'|'fist'|'open'|'unknown'}
 */
export function recognizeHandGesture(landmarks) {
  const states = detectFingerStates(landmarks);
  // 按优先级匹配：threeFolded 更具体先判断，再 fist、open
  if (GESTURES.threeFolded(states)) return 'threeFolded';
  if (GESTURES.fist(states)) return 'fist';
  if (GESTURES.open(states)) return 'open';
  return 'unknown';
}
