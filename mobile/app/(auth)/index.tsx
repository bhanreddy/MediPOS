import { Redirect } from 'expo-router';

/**
 * Legacy auth index — redirects to the new login screen.
 * Kept so that older navigation references to /(auth) still resolve.
 */
export default function AuthIndex() {
  return <Redirect href="/(auth)/login" />;
}
