import '../src/styles.css';

export const metadata = {
  title: '찬양이음 — 찬양팀 콘티 관리',
  description: '교회 찬양팀을 위한 일반예배·행사 콘티 관리 서비스',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
