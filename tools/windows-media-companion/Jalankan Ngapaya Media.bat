@echo off
setlocal
title Ngapaya Media Companion
echo Ngapaya Media Companion - hanya untuk jaringan kantor/rumah tepercaya.
echo Jangan forward port 8765 ke internet.
echo.
set /p "NGAPAYA_PIN=PIN companion (minimal 6 karakter): "
if not defined NGAPAYA_PIN goto :cancelled
set /p "NGAPAYA_ADMIN_PIN=PIN khusus Super Admin untuk kompresi (minimal 6 karakter): "
if not defined NGAPAYA_ADMIN_PIN goto :cancelled
set /p "NGAPAYA_GOOGLE_CLIENT_ID=Google OAuth Desktop client ID: "
if not defined NGAPAYA_GOOGLE_CLIENT_ID goto :missing_google
set /p "NGAPAYA_GOOGLE_CLIENT_SECRET=Google OAuth Desktop client secret: "
if not defined NGAPAYA_GOOGLE_CLIENT_SECRET goto :missing_google
set /p "NGAPAYA_MEDIA_DIR=Folder penyimpanan (Enter untuk Videos\Ngapaya-Media): "
if "%NGAPAYA_MEDIA_DIR%"=="" set "NGAPAYA_MEDIA_DIR=%USERPROFILE%\Videos\Ngapaya-Media"
if not exist "%NGAPAYA_MEDIA_DIR%" mkdir "%NGAPAYA_MEDIA_DIR%"
echo.
echo Website Ngapaya production memerlukan companion HTTPS.
echo Sertifikat yang sama dengan Storage LAN boleh digunakan jika mencakup subdomainnya.
set /p "NGAPAYA_TLS_CERT=Path sertifikat fullchain PEM: "
if not defined NGAPAYA_TLS_CERT goto :missing_tls
if not exist "%NGAPAYA_TLS_CERT%" goto :missing_tls_file
set /p "NGAPAYA_TLS_KEY=Path private key PEM: "
if not defined NGAPAYA_TLS_KEY goto :missing_tls
if not exist "%NGAPAYA_TLS_KEY%" goto :missing_tls_file
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
echo Companion harus tetap berjalan agar Gallery GDrive dapat diakses.
echo Simpan alamat https://subdomain-anda:8765 pada Tools - Setting.
echo.
python "%~dp0companion.py" --dir "%NGAPAYA_MEDIA_DIR%" --port 8765
pause
exit /b %errorlevel%

:missing_google
echo Google OAuth Desktop client ID dan secret wajib diisi untuk Gallery GDrive.
pause
exit /b 1

:missing_tls
echo Sertifikat fullchain dan private key PEM wajib diisi untuk website production.
pause
exit /b 1

:missing_tls_file
echo File sertifikat atau private key tidak ditemukan.
pause
exit /b 1

:cancelled
echo Dibatalkan.
exit /b 1
