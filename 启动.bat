@echo off
chcp 65001 >nul
title 风格转绘照相机 Demo

echo ========================================
echo   风格转绘照相机 · 一键启动
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [错误] 未检测到 Python，请先安装 Python 3.8+ 并加入 PATH。
    echo 下载地址：https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version') do set PYVER=%%v
echo 已检测到 Python %PYVER%

echo.
echo [2/3] 启动本地服务器（端口 8080）...
echo.
start "Demo Server" /min python start-server.py

echo.
echo [3/3] 打开浏览器...
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8080/

echo.
echo ========================================
echo  启动完成！
echo  浏览器已打开 http://127.0.0.1:8080/
echo.
echo  关闭窗口或按 Ctrl+C 停止服务器。
echo  首次加载模型需要约 10-30 秒，请耐心等待。
echo ========================================
echo.
pause
