declare const process: {
  env: Record<string, string | undefined>;
};

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};

export const hasSupabaseConfig =
  env.supabaseUrl.startsWith('https://') && env.supabasePublishableKey.length > 0;

