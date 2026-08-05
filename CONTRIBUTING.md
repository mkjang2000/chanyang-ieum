# 기여 안내

찬양이음에 관심을 가져 주셔서 감사합니다. 작은 오류 수정은 바로 Pull Request로 보내도 좋지만, 큰 기능이나 데이터 구조 변경은 먼저 이슈에서 방향을 맞춰 주세요.

## 개발 환경

- Node.js 20 이상
- MariaDB 10.6 이상
- PDF/OCR 기능을 위한 Poppler와 Tesseract

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Docker를 이용하는 경우 README의 `Docker로 바로 실행` 절차를 사용할 수 있습니다.

## 변경 확인

Pull Request를 열기 전에 최소한 아래 검사를 통과해 주세요.

```bash
npm run build
npm audit --omit=dev --audit-level=high
```

- 사용자 데이터와 기존 콘티·악보가 유지되는지 확인합니다.
- 모바일, 태블릿, 데스크톱 중 변경과 관련된 화면을 확인합니다.
- DB 변경은 `database/schema.sql`에 반복 실행 가능한 형태로 작성합니다.
- UI 문구는 교회 구성원이 쉽게 이해할 수 있는 한국어를 우선합니다.

## 개인정보와 저작권

다음 자료는 이슈, Pull Request, 커밋에 포함하면 안 됩니다.

- 실제 교회 계정, 세션, API 키, DB 접속정보
- 운영 DB 덤프와 서버 로그에 포함된 개인정보
- 배포 권한을 확인하지 않은 악보 이미지나 PDF

보안 문제는 공개 이슈 대신 [보안 정책](SECURITY.md)의 비공개 제보 절차를 이용해 주세요.

기여된 코드는 프로젝트의 [MIT License](LICENSE)에 따라 배포됩니다.
