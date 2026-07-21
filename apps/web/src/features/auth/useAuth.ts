import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './types';

/** Access the auth context. Throws if rendered outside an `AuthProvider`, so a
 *  missing provider is a loud programming error rather than a silent null. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
