import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminLogout, isAdminAuthed } from '../../api/mock'
import { Logo } from '../Home'

export default function AdminLayout() {
  const navigate = useNavigate()

  if (!isAdminAuthed()) return <Navigate to="/admin" replace />

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
    }`

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <Logo className="size-8" />
          <div>
            <div className="text-sm font-semibold text-slate-100">Enterprise Knowledge Platform</div>
            <div className="text-[11px] text-slate-500">Admin portal</div>
          </div>
        </div>
        <nav className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          <NavLink to="/admin/links" className={tab}>
            Proposal links
          </NavLink>
          <NavLink to="/admin/dashboard" className={tab}>
            Dashboard
          </NavLink>
        </nav>
        <button
          onClick={() => {
            adminLogout()
            navigate('/admin')
          }}
          className="text-xs text-slate-500 transition hover:text-slate-200"
        >
          Sign out
        </button>
      </header>
      <main className="py-6">
        <Outlet />
      </main>
    </div>
  )
}
