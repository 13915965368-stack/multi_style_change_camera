# 风格转绘照相机 - Web Demo

浏览器可运行的手势取景框 + 框内风格变换 Demo。

## 运行方式

1. 进入 `demo` 目录。
2. 启动本地服务器（推荐使用仓库自带的脚本，可正确返回 `.js` 的 MIME 类型）：
   ```bash
   python start-server.py
   ```
   也可以用内置服务器，但需注意模块加载对 MIME 类型的要求：
   ```bash
   python -m http.server 8080
   ```
3. 浏览器访问：
   ```
   http://127.0.0.1:8080/
   ```
4. 允许摄像头权限。
5. 双手举到摄像头前，用拇指和食指比出矩形取景框。
6. 在底部选择风格，点击拍照按钮保存结果。

## 功能

- 摄像头实时预览（支持多摄像头切换）
- MediaPipe Tasks Vision HandLandmarker 手势识别
- 双手食指+拇指构成取景框，跟随双手移动
- 框内实时 Canvas 风格化滤镜
- 切换风格：名画油彩 / JOJO动漫 / 极简线条
- 拍照保存结果到相册区

## 模块结构

| 文件 | 职责 |
|------|------|
| `index.html` | 页面结构、CDN 引入、模块加载 |
| `styles.css` | 页面样式 |
| `camera.js` | 摄像头启停、设备枚举 |
| `detector.js` | MediaPipe HandLandmarker 封装 |
| `frameRenderer.js` | 取景框遮罩、边框、角标绘制 |
| `styleTransfer.js` | 风格滤镜定义与框内区域处理 |
| `app.js` | 主程序：协调各模块、主循环、拍照 |
| `start-server.py` | 本地服务器（修复 .js MIME 类型） |

## 浏览器要求

- Chrome / Edge / Safari 最新版
- 必须通过 `localhost` 或 HTTPS 访问，否则摄像头权限会被浏览器拒绝
- 需要支持 WebGL 2.0（MediaPipe HandLandmarker GPU 模式依赖）
- 如遇 Edge 的 Tracking Prevention 拦截存储，需在地址栏左侧关闭对该站点的跟踪防护

## 已知限制

- 本阶段使用 Canvas CSS 滤镜模拟风格化，后续可替换为 TensorFlow.js 真实风格迁移模型。
- 手势识别在快速移动或光照不足时可能不稳定，属于 MediaPipe 模型本身的限制。
- 拍照结果保存在页面相册区，可右键另存为图片。
