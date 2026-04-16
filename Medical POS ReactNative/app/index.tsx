import { Redirect } from 'expo-router';

/** Ensures `/` always resolves (avoids blank web until client redirects). */
export default function Index() {
  return <Redirect href="/(app)" />;
}
