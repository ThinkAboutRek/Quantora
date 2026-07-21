import { Route, Routes } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { PublicOnlyRoute } from '../features/auth/components/PublicOnlyRoute';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { PortfoliosPage } from '../features/portfolios/pages/PortfoliosPage';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';

/**
 * Declarative route table. A single layout route wraps every page so they share
 * the header/footer chrome. The index is the public landing page (reachable even
 * when authenticated); /login and /register are public-only; /app is protected;
 * and "*" catches everything else.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<LandingPage />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="app" element={<PortfoliosPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
