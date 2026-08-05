# 찬양이음

찬양이음은 교회 찬양팀이 일반 예배와 수련회·성경학교 같은 행사의 콘티와 악보를 함께 관리하는 자체 호스팅 웹앱입니다. 모바일·태블릿 뷰어, 역할별 권한, 실시간 메모와 진행 알림을 지원합니다.

## 주요 기능

- 일반 예배와 행사 콘티를 한 달력에서 통합 조회
- 교회별 예배 프리셋, 기본 시간, 시작 악기 설정
- 이미지 직접 업로드, 저장 악보 재사용, 카카오 이미지 검색
- PDF 악보 페이지 자동 분리 및 제목 OCR
- 저장 악보 원본 관리와 중복 제거
- 모바일·태블릿 대응 연속 스크롤 악보 뷰어
- 핀치 줌, 화면 자동 맞춤, 전체 화면
- 곡별 Key, 교회 편성에 맞춘 시작 악기, 곡 전환, 메모 관리
- 메모 편집자 표시 및 실시간 갱신
- 관리자 설정형 실시간 진행 알림과 개인 퀵버튼
- 원본 이미지와 전체 콘티 PDF 다운로드
- 만료 및 폐기가 가능한 외부 공유 링크
- 로그인 기록, 강제 로그아웃, 사용자 및 시스템 관리

## 권한

| 역할 | 권한 |
| --- | --- |
| 관리자 | 전체 기능, 사용자·예배·진행 알림·시스템 관리 |
| 인도자 | 본인이 담당하는 콘티 등록·수정·삭제 및 진행 알림 전송 |
| 반주자 | 콘티 조회와 악보별 메모 추가·수정 |
| 성도 | 조회 전용 |

관리자가 다른 인도자를 담당자로 지정해 콘티를 등록하면 해당 인도자도 그 콘티를 관리할 수 있습니다.

## 기술 구성

- Node.js 20 이상
- React 19 + vinext/Vite
- MariaDB
- 서버 파일 시스템 이미지 저장소
- Server-Sent Events(SSE) 기반 실시간 동기화
- Poppler/Tesseract 기반 PDF 변환 및 제목 OCR
- 선택 사항: Audiveris 기반 악보 Key 인식

현재 실시간 채널은 애플리케이션 프로세스 메모리를 사용합니다. 기본 구성처럼 웹 프로세스 하나로 실행해야 하며, 여러 인스턴스로 확장하려면 Redis Pub/Sub 같은 외부 메시지 계층이 필요합니다.

## Docker로 바로 실행

Docker Engine과 Docker Compose 플러그인만 설치되어 있으면 MariaDB를 별도로 준비하지 않아도 됩니다.

```bash
git clone https://github.com/mkjang2000/chanyang-ieum.git
cd chanyang-ieum
cp docker.env.example .env
```

`.env`의 `DB_PASSWORD`를 충분히 긴 임의 문자열로 바꾸고, 이미지 검색을 사용할 경우 `KAKAO_REST_API_KEY`도 입력합니다. 그다음 아래 명령으로 앱과 DB를 함께 시작합니다.

```bash
docker compose up -d --build
docker compose ps
```

기본 주소는 `http://127.0.0.1:3011`입니다. 첫 접속 시 만드는 계정이 관리자가 됩니다. 다른 기기에서 컨테이너 포트로 직접 접속하려면 `.env`의 `APP_BIND`를 `0.0.0.0`으로 바꾸세요. 공개 운영에서는 기본값인 `127.0.0.1`을 유지하고 nginx나 Caddy 같은 HTTPS 리버스 프록시를 앞에 두는 방식을 권장합니다.

```bash
docker compose logs -f app       # 애플리케이션 로그
docker compose restart app       # 애플리케이션 재시작
docker compose down              # 컨테이너 중지 (데이터 유지)
docker compose down --volumes    # DB와 악보까지 완전 삭제하므로 주의
```

Compose 구성은 다음을 자동으로 처리합니다.

- MariaDB가 준비될 때까지 대기한 뒤 DB 스키마 생성·업데이트
- PDF 분리용 Poppler와 한글·영문 제목 OCR용 Tesseract 제공
- DB를 `database-data`, 악보 원본을 `image-data` 볼륨에 영구 저장
- 앱과 DB 헬스체크 및 장애 시 자동 재시작

Audiveris 기반 Key 자동 인식은 이미지 용량과 Java 의존성이 커서 기본 Docker 이미지에는 포함하지 않습니다. 나머지 콘티·PDF·OCR 기능은 기본 이미지에서 바로 사용할 수 있습니다.

## 설치 요구 사항

필수:

- Node.js 20 이상과 npm
- MariaDB 10.6 이상
- PDF 가져오기를 위한 Poppler 명령어: `pdfinfo`, `pdftoppm`, `pdftotext`
- 한글 제목 OCR을 위한 Tesseract와 `kor`, `eng` 언어 데이터

선택:

- Key 자동 인식: Java, ImageMagick, `unzip`, Audiveris
- 인터넷 악보 이미지 검색: 카카오 디벨로퍼스 REST API 키

Ubuntu/Debian 계열의 PDF/OCR 필수 패키지 예시는 다음과 같습니다.

```bash
sudo apt install poppler-utils tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng
```

## 빠른 시작

```bash
git clone https://github.com/mkjang2000/chanyang-ieum.git
cd chanyang-ieum
npm ci
cp .env.example .env.local
```

MariaDB에 데이터베이스와 전용 사용자를 만든 뒤 `.env.local`을 수정합니다. 데이터베이스 계정에는 해당 데이터베이스의 테이블 생성·변경·조회·수정 권한이 필요합니다.

```bash
npm run db:migrate
npm run dev
```

개발 서버는 모든 인터페이스에서 열립니다. 외부에 직접 노출하지 말고 방화벽 또는 개발 환경의 포트 전달 기능을 사용하세요.

첫 접속 시 생성하는 첫 번째 계정이 관리자가 됩니다.

## 환경변수

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `PORT` | 아니요 | 웹 서버 포트, 기본값 `3000` |
| `HOST` | 아니요 | 바인딩 주소, 기본값 `0.0.0.0` |
| `DB_SOCKET` | 조건부 | MariaDB Unix 소켓 경로 |
| `DB_HOST` | 조건부 | TCP로 연결할 MariaDB 호스트 |
| `DB_PORT` | 아니요 | MariaDB TCP 포트, 기본값 `3306` |
| `DB_USER` | 예 | MariaDB 사용자 |
| `DB_PASSWORD` | 예 | MariaDB 비밀번호 |
| `DB_NAME` | 예 | 데이터베이스 이름 |
| `IMAGE_STORAGE_DIR` | 예 | 업로드·검색 악보 원본 저장 디렉터리 |
| `KAKAO_REST_API_KEY` | 아니요 | 카카오 이미지 검색 REST API 키 |
| `AUDIVERIS_PATH` | 아니요 | Audiveris 실행 파일 경로 |
| `DEBUG_PDF_OCR` | 아니요 | `1`이면 PDF 제목 OCR 진단 로그 출력 |

Docker Compose에서는 `docker.env.example`을 `.env`로 복사해 `APP_BIND`, `APP_PORT`, DB 계정과 선택 기능 키를 설정합니다. 컨테이너 내부의 `HOST`, `PORT`, `DB_HOST`, `IMAGE_STORAGE_DIR`은 `compose.yaml`이 안전한 값으로 지정합니다.

DB 연결은 `DB_SOCKET` 또는 `DB_HOST` 중 하나가 필요합니다. 둘 다 설정하면 Unix 소켓을 우선합니다.

실제 키와 비밀번호는 반드시 `.env.local`에만 저장하세요. `.env.local`은 Git에서 제외됩니다.

## 프로덕션 실행

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

`HOST=127.0.0.1`로 설정하고 nginx, Caddy 같은 HTTPS 리버스 프록시 뒤에서 실행하는 방식을 권장합니다. SSE가 즉시 전달되도록 프록시 버퍼링을 비활성화하고 충분한 읽기 제한 시간을 설정하세요.

nginx 위치 설정의 핵심 예시는 다음과 같습니다.

```nginx
location / {
    proxy_pass http://127.0.0.1:3011;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

## 데이터 보관과 백업

- 콘티·행사·곡·설정·이미지 메타데이터: MariaDB
- 업로드 및 검색으로 선택한 이미지 원본: `IMAGE_STORAGE_DIR`
- DB 스키마와 반복 실행 가능한 마이그레이션: `database/schema.sql`

백업할 때는 DB 덤프와 이미지 디렉터리를 같은 시점에 함께 보관해야 합니다. 복구할 때도 두 자료가 모두 필요합니다.

콘티에서 더 이상 참조하지 않는 찬양과 악보 파일은 정리 대상이 됩니다. 자동 정리는 하루 한 번 검사하며 관리자가 시스템 화면에서 수동으로 실행할 수도 있습니다.

## 보안 및 저작권

- 비밀번호는 scrypt로 해시되어 저장됩니다.
- 로그인 세션은 `HttpOnly`, `SameSite=Lax` 쿠키를 사용합니다.
- 공유 링크는 만료 시간을 가지며 관리자 또는 발급자가 폐기할 수 있습니다.
- 인터넷에서 찾은 악보와 업로드한 악보의 이용 권한은 운영 교회가 직접 확인해야 합니다.
- 저장소에는 실제 교회 계정, DB 덤프, `.env.local`, 악보 이미지나 PDF를 커밋하지 마세요.

## 스크립트

```bash
npm run dev        # 개발 서버
npm run db:migrate # DB 스키마 생성 및 업데이트
npm run build      # 프로덕션 빌드
npm start          # 빌드된 서버 실행
```

## 라이선스

소스 코드는 [MIT License](LICENSE)로 배포합니다. 악보 이미지, PDF 및 검색 결과의 저작권은 이 라이선스에 포함되지 않습니다.

버전별 주요 변경 사항은 [CHANGELOG.md](CHANGELOG.md)에서 확인할 수 있습니다.
