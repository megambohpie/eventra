import { Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireCapability } from './auth/guards';
import { Layout } from './components/Layout';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { AssetsPage } from './pages/AssetsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { CustomersPage } from './pages/CustomersPage';
import { HomePage } from './pages/HomePage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { ReplacementDetailPage } from './pages/ReplacementDetailPage';
import { ReplacementsPage } from './pages/ReplacementsPage';
import { ServiceTicketsPage } from './pages/ServiceTicketsPage';
import { CalendarPage } from './pages/CalendarPage';
import { MasterPage } from './pages/MasterPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { PickListDetailPage } from './pages/PickListDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { WarehousePage } from './pages/WarehousePage';
import { DemoAccountsPage } from './pages/auth/DemoAccountsPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="demo-accounts" element={<DemoAccountsPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<HomePage />} />
          <Route element={<RequireCapability capability="customer.read" />}>
            <Route path="customers" element={<CustomersPage />} />
          </Route>
          <Route element={<RequireCapability capability="product.read" />}>
            <Route path="products" element={<ProductsPage />} />
          </Route>
          <Route element={<RequireCapability capability="asset.read" />}>
            <Route path="assets" element={<AssetsPage />} />
            <Route path="assets/:id" element={<AssetDetailPage />} />
          </Route>
          <Route element={<RequireCapability capability="receipt.read" />}>
            <Route path="receipts" element={<ReceiptsPage />} />
          </Route>
          <Route element={<RequireCapability capability="order.read" />}>
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="calendar" element={<CalendarPage />} />
          </Route>
          <Route element={<RequireCapability capability="warehouse.read" />}>
            <Route path="warehouse" element={<WarehousePage />} />
            <Route path="warehouse/pick-lists/:id" element={<PickListDetailPage />} />
          </Route>
          <Route element={<RequireCapability capability="incident.read" />}>
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
          </Route>
          <Route element={<RequireCapability capability="warehouse.read" />}>
            <Route path="replacements" element={<ReplacementsPage />} />
            <Route path="replacements/:id" element={<ReplacementDetailPage />} />
          </Route>
          <Route element={<RequireCapability capability="service.read" />}>
            <Route path="service-tickets" element={<ServiceTicketsPage />} />
          </Route>
          <Route element={<RequireCapability capability="dashboard.read" />}>
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<RequireCapability capability="finance.read" />}>
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="finance" element={<FinancePage />} />
          </Route>
          <Route element={<RequireCapability capability="master.read" />}>
            <Route path="master" element={<MasterPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
