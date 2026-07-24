'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

const AUTH_PATHS = ['/login', '/'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_PATHS.includes(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 min-h-screen pb-20 lg:pb-0${isAuth ? '' : ' lg:ml-[220px]'}`}>
        {children}
      </main>
    </div>
  );
}
