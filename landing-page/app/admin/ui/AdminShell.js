'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/admin';

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    router.push('/admin');
  };

  if (isLogin) {
    return <div className="admin-shell">{children}</div>;
  }

  return (
    <div className="admin-shell">
      <div className="admin-container admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-mark">GF</span>
            <div>
              <p className="admin-brand-title">GlucoForager</p>
              <p className="admin-brand-subtitle">Admin Console</p>
            </div>
          </div>
          <nav className="admin-nav">
            <Link href="/admin/dashboard" className={pathname === '/admin/dashboard' ? 'active' : ''}>
              Dashboard
            </Link>
            <Link href="/admin/recipes" className={pathname === '/admin/recipes' ? 'active' : ''}>
              Recipes
            </Link>
            <Link
              href="/admin/recipes/new"
              className={pathname === '/admin/recipes/new' ? 'active' : ''}
            >
              New Recipe
            </Link>
          </nav>
          <button className="admin-button secondary" type="button" onClick={handleLogout}>
            Log out
          </button>
        </aside>

        <main className="admin-main">
          <header className="admin-header">
            <h1>GlucoForager Admin</h1>
            <p>Manage recipes and suggestions for the mobile app.</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
