declare const process: {
  env: Record<string, string | undefined>;
};

export const env = {
  ...selectRuntimeEnv(),
};

export const hasSupabaseConfig =
  env.supabaseUrl.startsWith('https://') && env.supabasePublishableKey.length > 0;

function selectRuntimeEnv() {
  const defaultEnv = {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  };

  const homeEnv = {
    supabaseUrl: process.env.EXPO_PUBLIC_HOME_SUPABASE_URL ?? '',
    supabasePublishableKey: process.env.EXPO_PUBLIC_HOME_SUPABASE_PUBLISHABLE_KEY ?? '',
  };

  if (
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/home') &&
    homeEnv.supabaseUrl.startsWith('https://') &&
    homeEnv.supabasePublishableKey.length > 0
  ) {
    return homeEnv;
  }

  return defaultEnv;
}
