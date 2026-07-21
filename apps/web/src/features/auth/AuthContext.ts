import { createContext } from 'react';
import type { AuthContextValue } from './types';

// The auth context lives in its own module (not the provider file) so that both
// the provider and the `useAuth` hook can import it without the provider file
// exporting a non-component. `null` is the "no provider" sentinel that `useAuth`
// detects.
export const AuthContext = createContext<AuthContextValue | null>(null);
