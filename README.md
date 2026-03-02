# AI Multi WebView (Electron MVP)

입력창 1개와 `WebView` 4개(ChatGPT, Gemini, Grok, Perplexity)를 제공하는 데스크톱 앱입니다.

## 실행

```bash
npm install
npm start
```

## 빌드 (Build)

macOS용 애플리케이션을 빌드하려면 다음 명령어를 실행하세요:

```bash
# Mac 빌드 (ARM64)
npm run build:mac
```

빌드가 완료되면 `dist/mac-arm64/AI.app` 경로에 실행 파일이 생성됩니다.  
애플리케이션 폴더로 복사하려면 다음 명령어를 사용할 수 있습니다:

```bash
cp -R dist/mac-arm64/AI.app /Applications/AI.app
```

## 기능

- 질문 입력 1개
- `질문 브로드캐스트` 버튼으로 4개 WebView 입력창에 자동 입력 시도
- `새 질문` 버튼
- `외부 브라우저로 4개 열기` 버튼

## 참고

- 자동 입력은 각 서비스의 UI 구조/정책 변경 시 실패할 수 있습니다.
- 실패 시 외부 브라우저 열기 후 수동 붙여넣기를 사용하세요.
- Electron 엔트리: `main.js`
- 렌더러 화면: `app/index.html`
