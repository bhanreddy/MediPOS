import { Image } from 'expo-image';
import { useGlassPreferences } from '@/components/glass/LiquidGlass';
import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { store } from '../../utils/storage';

type FestivalPoster = {
  id: string;
  title: string;
  image_url: string | null;
  ends_at: string;
};

// Android emulators reach the dev machine via 10.0.2.2 — rewrite to loopback on web.
function resolveSuperAdminApiUrl(): string {
  const primary = (process.env.EXPO_PUBLIC_SUPERADMIN_API_URL || '').trim();
  const resolved = Platform.OS === 'web'
    ? primary.replace(/10\.0\.2\.2/g, '127.0.0.1').replace(/10\.0\.3\.2/g, '127.0.0.1')
    : primary;
  return resolved || 'https://superadminbackend-8ulw.onrender.com';
}

const SUPERADMIN_API_URL = resolveSuperAdminApiUrl();

const seenKey = (userId: string, posterId: string) => `festival_poster_seen:${userId}:${posterId}`;


/**
 * Festival poster popup uploaded from the SuperAdmin app. Shown at most once
 * per user per poster. Fail-silent: any error means no popup.
 */
export function FestivalPosterGate() {
  const { width, height } = useWindowDimensions();
  const { reduceMotion } = useGlassPreferences();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const [poster, setPoster] = useState<FestivalPoster | null>(null);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${SUPERADMIN_API_URL}/api/public/festival-poster?app=medipos`);
        if (!res.ok) return;
        const body = await res.json();
        const p: FestivalPoster | null = body?.poster ?? null;
        if (!p || !p.image_url || !mounted) return;
        if (store.getString(seenKey(userId, p.id))) return;
        // Mark seen at show-time so an app kill can't re-show it.
        store.set(seenKey(userId, p.id), new Date().toISOString());
        setPoster(p);
      } catch {
        // Silent: the poster popup must never affect app startup.
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  if (!poster?.image_url) return null;

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setPoster(null)}>
      <Pressable style={styles.backdrop} onPress={() => setPoster(null)}>
        <Pressable style={[styles.card, { width: Math.min(width - 40, 420), maxHeight: height * 0.8 }]} onPress={() => {}}>
          <Image
            source={{ uri: poster.image_url }}
            style={[styles.image, { height: Math.min(height * 0.72, 560) }]}
            contentFit="contain"
            cachePolicy="memory-disk"
            allowDownscaling
            onError={() => setPoster(null)}
          />
          <Pressable
            style={styles.closeBtn}
            onPress={() => setPoster(null)}
            hitSlop={12}
            accessibilityLabel="Close festival poster"
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 20,
  },
  image: {
    width: '100%',
    borderRadius: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
  },
});
