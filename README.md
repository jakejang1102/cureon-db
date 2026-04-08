# 팀 관리 (일정 · 업무 · 이력)

React(Vite) 프론트엔드와 Express + Prisma(SQLite) API로 구성된 팀 일정/업무 관리 앱입니다. 회원가입·로그인, 업무 CRUD, 이력 추가·수정·삭제, Docker 배포를 지원합니다.

## 요구 사항

- Node.js 20 이상
- npm

## 로컬 개발

### 1) 서버

```powershell
cd server
npm install
npx prisma db push
npm run dev
```

기본 주소: `http://localhost:4000`

`server/.env` 예시는 `server/.env.example`을 참고하세요. `JWT_SECRET`은 운영에서 반드시 긴 임의 문자열로 바꿉니다.

### 2) 클라이언트 (별도 터미널)

```powershell
cd client
npm install
npm run dev
```

기본 주소: `http://localhost:5173` — Vite가 `/api`를 서버로 프록시합니다.

### 프로덕션처럼 한 번에 확인

클라이언트 빌드 후 서버가 정적 파일을 제공합니다.

```powershell
cd client
npm run build
cd ..\server
$env:NODE_ENV="production"
node src/index.js
```

브라우저에서 `http://localhost:4000` 으로 접속합니다.

## Docker 배포

저장소 루트(`team-app`)에서:

```powershell
docker build -t team-app .
docker run -p 4000:4000 -v team-app-data:/app/data -e JWT_SECRET="여기에-긴-비밀" team-app
```

- SQLite DB 파일은 컨테이너의 `/app/data/prod.db`에 생성됩니다. `-v`로 볼륨을 붙이면 데이터가 유지됩니다.
- 컨테이너 시작 시 `prisma db push`로 스키마를 적용합니다.

## 기능

- **인증**: 회원가입, 로그인, JWT(로컬 스토리지), 로그아웃
- **캘린더**: 연간 / 월간 / 일간, 오늘 이동
- **업무**: 등록(+ FAB), 상세 모달에서 수정·삭제
- **이력**: 등록, 행 단위 수정·삭제
- **UI**: 구분·상태는 회색 톤 배지와 테두리 위주(과도한 카테고리 색상 제거)

## 프로젝트 구조

- `client/` — Vite + React
- `server/` — Express API, Prisma, SQLite(`dev.db`는 로컬 전용, Git 제외)
