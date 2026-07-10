import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dealers from './pages/Dealers'
import Assets from './pages/Assets'
import Crop from './pages/Crop'
import Newsletter from './pages/Newsletter'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dealers" element={<Dealers />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/crop" element={<Crop />} />
            <Route path="/newsletter" element={<Newsletter />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dealers" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
