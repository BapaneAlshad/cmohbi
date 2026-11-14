@echo off
setlocal
title Ngapaya Media Companion
echo Ngapaya Media Companion - hanya untuk jaringan kantor/rumah tepercaya.
echo Jangan forward port 8765 ke internet.
echo.
set /p "NGAPAYA_PIN=PIN companion (minimal 6 karakter): "
if "%NGAPAYA_PIN%"=="" goto :eof
set /p "NGAPAYA_ADMIN_PIN=PIN khusus Super Admin untuk kompresi (minimal 6 karakter): "
if "%NGAPAYA_ADMIN_PIN%"=="" goto :eof
set /p "NGAPAYA_GOOGLE_CLIENT_ID=Google OAuth Desktop client ID (Enter untuk lewati): "
if not "%NGAPAYA_GOOGLE_CLIENT_ID%"=="" set /p "NGAPAYA_GOOGLE_CLIENT_SECRET=Google OAuth Desktop client secret: "
set /p "NGAPAYA_MEDIA_DIR=Folder penyimpanan (Enter untuk Videos\Ngapaya-Media): "
if "%NGAPAYA_MEDIA_DIR%"=="" set "NGAPAYA_MEDIA_DIR=%USERPROFILE%\Videos\Ngapaya-Media"
if not exist "%NGAPAYA_MEDIA_DIR%" mkdir "%NGAPAYA_MEDIA_DIR%"
echo.
echo Media disimpan ke: %NGAPAYA_MEDIA_DIR%
set "NGAPAYA_FFMPEG_PATH="
for /f "delims=" %%F in ('where ffmpeg.exe 2^>nul') do (
  set "NGAPAYA_FFMPEG_PATH=%%F"
  goto :ffmpeg_found
)
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg.Shared_*\ffmpeg-*-full_build-shared\bin") do if exist "%%~fD\ffmpeg.exe" (
  set "NGAPAYA_FFMPEG_PATH=%%~fD\ffmpeg.exe"
  goto :ffmpeg_found
)
echo FFmpeg tidak ditemukan. Instal FFmpeg atau tambahkan ffmpeg.exe ke PATH.
pause
exit /b 1
:ffmpeg_found
echo FFmpeg: %NGAPAYA_FFMPEG_PATH%
echo Companion harus tetap berjalan agar upload dan kompresi PC dapat diakses.
echo.
python "%~dp0companion.py" --dir "%NGAPAYA_MEDIA_DIR%" --port 8765 --pin "%NGAPAYA_PIN%" --admin-pin "%NGAPAYA_ADMIN_PIN%" --google-client-id "%NGAPAYA_GOOGLE_CLIENT_ID%" --google-client-secret "%NGAPAYA_GOOGLE_CLIENT_SECRET%" --ffmpeg "%NGAPAYA_FFMPEG_PATH%"
pause
