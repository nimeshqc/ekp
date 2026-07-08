import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Landing from './pages/prospect/Landing'
import Workspace from './pages/prospect/Workspace'
import SourceViewer from './pages/viewer/SourceViewer'
import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import LinksPage from './pages/admin/LinksPage'
import DashboardPage from './pages/admin/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/p/:token" element={<Landing />} />
      <Route path="/p/:token/w" element={<Workspace />} />
      <Route path="/viewer/:docId" element={<SourceViewer />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin/links" element={<LinksPage />} />
        <Route path="/admin/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
