// components/NavBar.js
import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';
import ChangePassword from './ChangePassword';
import { useAuth } from '../hooks/useAuth';

export default function NavBar() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // hide NavBar on public pages
  const publicPaths = ['/', '/request-access', '/signup', '/signin'];
  if (publicPaths.includes(router.pathname)) return null;
  if (loading) return <nav style={{ padding: 10, borderBottom: '1px solid #eee' }} />;
  if (!user) return null;

  const isActive = (path) => {
    try {
      return router.pathname === path || router.pathname.startsWith(path + '/');
    } catch {
      return false;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const NavLink = ({ href, children }) => (
    <Link
      href={href}
      className={`nav-link ${isActive(href) ? 'active' : ''}`}
      onClick={() => setMobileOpen(false)}
    >
      {children}
    </Link>
  );

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left" onClick={() => router.push('/dashboard')} role="button" tabIndex={0}>
          <div className="brand-text">
            <div className="brand-name">Fãs de T-shirt</div>
            <div className="brand-sub">Controle de Vendas</div>
          </div>
        </div>

        <div className={`navbar-center ${mobileOpen ? 'open' : ''}`}>
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/sales">Vendas</NavLink>
          <NavLink href="/customers">Clientes</NavLink>
          <NavLink href="/payments">Pagamentos</NavLink>
          {isAdmin && <NavLink href="/admin">Admin</NavLink>}
        </div>

        <div className="navbar-right">
          <div className="user-actions">
            <button className="btn ghost" onClick={() => setShowChangePwd(true)}>Alterar senha</button>
            <button className="btn primary" onClick={handleSignOut}>Sair</button>
            <button
              className="mobile-toggle"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(prev => !prev)}
            >
              <span className="burger" />
            </button>
          </div>
        </div>
      </nav>

      {showChangePwd && (
        <div className="modal-backdrop" onClick={() => setShowChangePwd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowChangePwd(false)} aria-label="Fechar">✕</button>
            <ChangePassword />
          </div>
        </div>
      )}

      <style jsx>{`
        .navbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 18px;
          border-bottom: 1px solid #eef2ff;
          background: linear-gradient(180deg, #ffffff, #fbfbff);
          box-shadow: 0 2px 8px rgba(15,23,42,0.03);
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .navbar-left { display:flex; align-items:center; gap:12px; min-width: 180px; cursor: pointer; }
        .brand-text { display:flex; flex-direction:column; }
        .brand-name { font-weight: 700; color: #111827; font-size: 14px; line-height: 14px; }
        .brand-sub { font-size: 11px; color: #6b7280; line-height: 12px; }

        .navbar-center { display:flex; gap:10px; align-items:center; flex: 1; justify-content:center; }

        /* Target the anchor that Next.js renders, garantindo precedência sobre estilos padrões */
        .navbar-center :global(a.nav-link), .navbar-center a.nav-link {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:8px 12px;
          border-radius:10px;
          color:#374151;
          text-decoration:none;
          font-weight:600;
          font-size:14px;
          transition: all .15s ease;
          border: 1px solid transparent;
          background: transparent;
        }

        .navbar-center :global(a.nav-link:hover), .navbar-center a.nav-link:hover {
          background: #f8fafc;
          transform: translateY(-1px);
          color: #111827;
        }
        .navbar-center :global(a.nav-link.active), .navbar-center a.nav-link.active {
          background: linear-gradient(90deg,#f3e8ff,#fbe8d6);
          color: #4c1d95;
          box-shadow: 0 6px 18px rgba(79,70,229,0.06);
          border: 1px solid rgba(124,58,237,0.12);
        }

        .navbar-right { display:flex; align-items:center; gap:12px; justify-content:flex-end; min-width: 220px; }
        .user-actions { display:flex; gap:8px; align-items:center; }

        .btn {
          border: none;
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn.primary {
          background: linear-gradient(90deg,#4c1d95,#e77aae);
          color: white;
        }
        .btn.ghost {
          background: transparent;
          border: 1px solid #e6e6f0;
          color: #374151;
        }

        /* mobile toggle (hidden on desktop) */
        .mobile-toggle { display:none; background: transparent; border: none; padding: 6px; margin-left: 8px; }
        .burger {
          width: 22px;
          height: 2px;
          background: #374151;
          display:block;
          position: relative;
          border-radius: 2px;
        }
        .burger::before, .burger::after {
          content: '';
          position: absolute;
          left: 0;
          width: 22px;
          height: 2px;
          background: #374151;
          border-radius: 2px;
        }
        .burger::before { top: -6px; }
        .burger::after { top: 6px; }

        /* modal */
        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index: 9999;
        }
        .modal { background: white; padding: 20px; border-radius: 10px; min-width: 320px; max-width: 92%; position: relative; box-shadow: 0 12px 40px rgba(2,6,23,0.2); }
        .close-btn { position:absolute; right:10px; top:10px; border:none; background:transparent; font-size:16px; cursor:pointer; }

        /* responsive: collapse nav on small screens */
        @media (max-width: 900px) {
          .navbar-center { position: absolute; left: 12px; right: 12px; top: 64px; background: white; border-radius: 10px; padding: 12px; flex-direction: column; gap: 8px; box-shadow: 0 10px 30px rgba(2,6,23,0.06); transform: translateY(-10px); opacity: 0; pointer-events: none; transition: all .18s ease; }
          .navbar-center.open { transform: translateY(0); opacity: 1; pointer-events: auto; }
          .navbar { padding-right: 12px; }
          .mobile-toggle { display:inline-flex; }
          .navbar-left { min-width: 140px; }
          .navbar-right { min-width: auto; }
        }
      `}</style>
    </>
  );
}