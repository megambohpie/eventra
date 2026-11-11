import { Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireCapability } from './auth/guards';
import { Layout } from './components/Layout';
import { CustomersPage } from './pages/CustomersPage';
import { HomePage } from './pages/HomePage';
import { MasterPage } from './pages/MasterPage';
import { ProductsPage } from './pages/ProductsPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
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
          <Route element={<RequireCapability capability="master.read" />}>
            <Route path="master" element={<MasterPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
