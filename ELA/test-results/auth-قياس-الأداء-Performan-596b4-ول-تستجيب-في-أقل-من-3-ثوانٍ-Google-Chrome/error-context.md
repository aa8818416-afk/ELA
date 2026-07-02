# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> قياس الأداء (Performance Baseline) >> صفحة تسجيل الدخول تستجيب في أقل من 3 ثوانٍ
- Location: tests\e2e\auth.spec.ts:91:7

# Error details

```
Error: browserContext.newPage: Executable doesn't exist at C:\Users\ELFATH\AppData\Local\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe
╔═════════════════════════════════════════════════════════════════╗
║ Video rendering requires ffmpeg binary.                         ║
║ Downloading it will not affect any of the system-wide settings. ║
║ Please run the following command:                               ║
║                                                                 ║
║     npx playwright install ffmpeg                               ║
║                                                                 ║
║ <3 Playwright Team                                              ║
╚═════════════════════════════════════════════════════════════════╝
```