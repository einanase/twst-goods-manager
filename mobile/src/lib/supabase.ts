import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabaseConfig } from './env';

let client: SupabaseClient | null = null;
let appStateListenerReady = false;

export function getSupabase() {
  if (!hasSupabaseConfig) {
    throw new Error('Supabase settings are missing. Follow mobile/ENVIRONMENTS.md to create mobile/.env.');
  }

  if (!client) {
    client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        lock: processLock,
      },
    });
  }

  if (!appStateListenerReady && Platform.OS !== 'web') {
    appStateListenerReady = true;
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') {
        client.auth.startAutoRefresh();
      } else {
        client.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}
