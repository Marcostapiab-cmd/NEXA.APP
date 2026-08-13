'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

const NO_SIDEBAR_PATHS = new Set(['/', '/login', '/registro', '/recuperar-contrasena', '/actualizar-contrasena']);
const NO_SIDEBAR_PREFIXES = ['/portal', '/clases-grupales', '/unirse', '/mi-cuenta', '/grupales-alumno', '/reservar'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noSidebar = NO_SIDEBAR_PATHS.has(pathname) ||
    NO_SIDEBAR_PREFIXES.some(p => pathname.startsWith(p));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 min-h-screen${noSidebar ? '' : ' pt-14 lg:pt-0 lg:ml-[220px]'}`}>
        {children}
      </main>
    </div>
  );
}
