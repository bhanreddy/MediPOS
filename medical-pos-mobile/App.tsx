import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { initLocalDb } from './src/lib/db';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initLocalDb().then(() => setDbReady(true)).catch(console.error);
  }, []);

  if (!dbReady) {
    return <View style={styles.container}><Text>Loading database...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
