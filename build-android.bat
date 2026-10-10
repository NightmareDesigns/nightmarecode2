@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where java >nul 2>nul
if errorlevel 1 (
    echo ERROR: Install a Java 17 JDK and add java to PATH.
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: Install Node.js 20 or later and add npm to PATH.
    exit /b 1
)

if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME (
    echo ERROR: Android SDK not found. Set ANDROID_HOME or install Android Studio.
    exit /b 1
)
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"

set "SDKMANAGER=%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat"
if not exist "%SDKMANAGER%" set "SDKMANAGER=%ANDROID_HOME%\tools\bin\sdkmanager.bat"
if exist "%SDKMANAGER%" (
    echo Checking Android SDK packages. Accept the Android SDK licenses if prompted.
    call "%SDKMANAGER%" --licenses
    if errorlevel 1 (
        echo ERROR: Android SDK license check failed.
        exit /b 1
    )
    call "%SDKMANAGER%" --install "platforms;android-35" "build-tools;35.0.0" "platform-tools"
    if errorlevel 1 (
        echo ERROR: Android SDK package installation failed.
        exit /b 1
    )
) else (
    if not exist "%ANDROID_HOME%\platforms\android-35\android.jar" (
        echo ERROR: Android SDK Platform 35 is missing and sdkmanager was not found.
        exit /b 1
    )
    if not exist "%ANDROID_HOME%\build-tools\35.0.0\aapt.exe" (
        echo ERROR: Android Build Tools 35.0.0 are missing and sdkmanager was not found.
        exit /b 1
    )
)

echo Installing locked project dependencies...
call npm ci
if errorlevel 1 (
    echo ERROR: npm dependency installation failed.
    exit /b 1
)

echo Building Android debug APK...
call npm run android:apk
if errorlevel 1 (
    echo ERROR: Android APK build failed. Check network access to Google Maven and SciJava.
    exit /b 1
)

if not exist "dist" mkdir "dist"
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "dist\NightmareDesignsCode-debug.apk" >nul
if errorlevel 1 (
    echo ERROR: APK built but could not be copied into dist.
    exit /b 1
)

echo.
echo APK ready: %CD%\dist\NightmareDesignsCode-debug.apk
exit /b 0
