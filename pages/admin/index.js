// pages/admin/index.js
import AdminRoute from '../../components/AdminRoute';
import Link from 'next/link';

export default function AdminHome() {
  return (
    <AdminRoute>
      <div style={{ maxWidth: 1000 }}>
        <h1>Administração</h1>

        <div className="card" style={{ padding: 16 }}>
          <nav>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', gap: 12, alignItems: 'center' }}>
              <li>
                <Link href="/admin/users" className="linkish">Gerenciar Usuários</Link>
              </li>
              {/* futuras páginas: /admin/logs, /admin/settings, etc. */}
            </ul>
          </nav>
        </div>
      </div>
    </AdminRoute>
  );
}