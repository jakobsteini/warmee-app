import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Dealers from './pages/Dealers'
import Assets from './pages/Assets'
import Crop from './pages/Crop'
import Newsletter from './pages/Newsletter'
import Products from './pages/Products'
import Orders from './pages/Orders'
import OrderEdit from './pages/OrderEdit'
import ProductionOrders from './pages/ProductionOrders'
import ProductionOrderEdit from './pages/ProductionOrderEdit'
import Deliveries from './pages/Deliveries'
import DeliveryEdit from './pages/DeliveryEdit'
import Invoices from './pages/Invoices'
import InvoiceEdit from './pages/InvoiceEdit'
import OpenPayments from './pages/OpenPayments'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dealers" element={<Dealers />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/crop" element={<Crop />} />
            <Route path="/newsletter" element={<Newsletter />} />
            <Route path="/products" element={<Products />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderEdit />} />
            <Route path="/nepal-orders" element={<ProductionOrders />} />
            <Route
              path="/nepal-orders/:id"
              element={<ProductionOrderEdit />}
            />
            <Route path="/deliveries" element={<Deliveries />} />
            <Route path="/deliveries/:id" element={<DeliveryEdit />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/:id" element={<InvoiceEdit />} />
            <Route path="/open-payments" element={<OpenPayments />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
