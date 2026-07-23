import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Dealers from './pages/Dealers'
import DealerDetail from './pages/DealerDetail'
import Assets from './pages/Assets'
import AssetsAssign from './pages/AssetsAssign'
import Crop from './pages/Crop'
import Newsletter from './pages/Newsletter'
import Products from './pages/Products'
import Orders from './pages/Orders'
import OrderEdit from './pages/OrderEdit'
import ProductionOrders from './pages/ProductionOrders'
import ProductionOrderEdit from './pages/ProductionOrderEdit'
import Deliveries from './pages/Deliveries'
import DeliveryEdit from './pages/DeliveryEdit'
import DeliveryNoteEdit from './pages/DeliveryNoteEdit'
import Inventory from './pages/Inventory'
import Invoices from './pages/Invoices'
import InvoiceNew from './pages/InvoiceNew'
import InvoiceEdit from './pages/InvoiceEdit'
import OpenPayments from './pages/OpenPayments'
import Dunning from './pages/Dunning'
import DunningSettings from './pages/DunningSettings'
import OssRates from './pages/OssRates'
import Suppliers from './pages/Suppliers'
import Commission from './pages/Commission'
import CorrectionNew from './pages/CorrectionNew'
import DefectReturns from './pages/DefectReturns'
import Analytics from './pages/Analytics'
import ArticleGroupsReport from './pages/ArticleGroupsReport'
import DealersNearby from './pages/DealersNearby'
import FollowUpList from './pages/FollowUpList'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dealers" element={<Dealers />} />
            <Route path="/dealers/:id" element={<DealerDetail />} />
            <Route path="/dealers-nearby" element={<DealersNearby />} />
            <Route path="/follow-up" element={<FollowUpList />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/assets/assign" element={<AssetsAssign />} />
            <Route path="/crop" element={<Crop />} />
            <Route path="/newsletter" element={<Newsletter />} />
            <Route path="/products" element={<Products />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderEdit />} />
            <Route
              path="/production-orders"
              element={<ProductionOrders />}
            />
            <Route
              path="/production-orders/:id"
              element={<ProductionOrderEdit />}
            />
            {/* Alt-Pfade (frühere „Nepal-Bestellung") weiterleiten. */}
            <Route
              path="/nepal-orders"
              element={<Navigate to="/production-orders" replace />}
            />
            <Route
              path="/nepal-orders/:id"
              element={<Navigate to="/production-orders" replace />}
            />
            <Route path="/deliveries" element={<Deliveries />} />
            <Route path="/deliveries/:id" element={<DeliveryEdit />} />
            <Route path="/delivery-notes/:id" element={<DeliveryNoteEdit />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/new" element={<InvoiceNew />} />
            <Route path="/corrections/new" element={<CorrectionNew />} />
            <Route path="/invoices/:id" element={<InvoiceEdit />} />
            <Route path="/oss-rates" element={<OssRates />} />
            <Route path="/open-payments" element={<OpenPayments />} />
            <Route path="/dunning" element={<Dunning />} />
            <Route path="/dunning/settings" element={<DunningSettings />} />
            <Route path="/commission" element={<Commission />} />
            <Route path="/defect-returns" element={<DefectReturns />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/article-groups-report" element={<ArticleGroupsReport />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
