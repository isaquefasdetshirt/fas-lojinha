// components/Layout.js
import React from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Layout({ children, pageTitle = '', loggedUserName = null }) {
  const { user } = useAuth();
  const um = user?.user_metadata ?? user?.app_metadata ?? user?.raw_user_meta_data ?? {};
  const nameFromMeta = um?.full_name || um?.fullName || um?.name || null;
  const displayName = loggedUserName || nameFromMeta || user?.email || user?.id || 'Usuário';

  return (
    <div className="container">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="brand">Fãs de T-shirt</div>
          <div className="page-title">{pageTitle}</div>
        </div>
        <div className="user-badge">Olá, {displayName}</div>
      </div>

      <main>
        {children}
      </main>
    </div>
  );
}