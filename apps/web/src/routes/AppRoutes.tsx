import { Route, Routes } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';

/**
 * Declarative route table. A single layout route wraps every page so they share
 * the header/footer chrome; the index route is the landing page and the "*"
 * catch-all renders the not-found page.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
