'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

const NO_SIDEBAR_PATHS = ['/login', '/'];
const NO_SIDEBAR_PREFIXES = ['/portal', '/clases-grupales'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noSidebar = NO_SIDEBAR_PATHS.includes(pathname) ||
    NO_SIDEBAR_PREFIXES.some(p => pathname.startsWith(p));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 min-h-screen pb-20 lg:pb-0${noSidebar ? '' : ' lg:ml-[220px]'}`}>
        {children}
      </main>
    </div>
  );
}
