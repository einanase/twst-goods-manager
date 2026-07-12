import { getSupabase } from '../lib/supabase';

export const STORAGE_BUCKET = 'mailing-images';
const SIGNED_IMAGE_URL_TTL = 60 * 60;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

type ImageRow = {
  image_url: string | null;
  image_display_url?: string;
};

export function getStoragePath(imageValue: string | null | undefined) {
  const raw = String(imageValue ?? '').trim();
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) return '';

  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+/, '');
  }

  try {
    const url = new URL(raw);
    const markers = [
      `/storage/v1/object/public/${STORAGE_BUCKET}/`,
      `/storage/v1/object/sign/${STORAGE_BUCKET}/`,
    ];
    const marker = markers.find((candidate) => url.pathname.includes(candidate));
    if (!marker) return '';
    return decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length));
  } catch {
    return '';
  }
}

export function getStoredImageValue(imageValue: string | null | undefined) {
  return getStoragePath(imageValue) || String(imageValue ?? '').trim() || null;
}

export async function createSignedImageUrl(imageValue: string | null | undefined) {
  const raw = String(imageValue ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) && !getStoragePath(raw)) return raw;

  const path = getStoragePath(raw);
  if (!path) return '';

  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await getSupabase()
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_IMAGE_URL_TTL);

  if (error) {
    console.warn('Failed to create signed image URL:', error.message);
    return '';
  }

  const url = data?.signedUrl ?? '';
  signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + (SIGNED_IMAGE_URL_TTL - 60) * 1000,
  });
  return url;
}

export async function attachDisplayImageUrls<T extends ImageRow>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_display_url: await createSignedImageUrl(row.image_url),
    })),
  );
}

export async function uploadPrivateImageFromUri({
  userId,
  uri,
  fileName,
  prefix,
}: {
  userId: string;
  uri: string;
  fileName?: string | null;
  prefix: 'inv' | 'trd';
}) {
  const extension = getSafeExtension(fileName || uri);
  const id = makeRandomId();
  const path = `${userId}/${prefix}_${id}.${extension}`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await getSupabase()
    .storage
    .from(STORAGE_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: getContentType(extension),
      upsert: false,
    });

  if (error) throw error;
  signedUrlCache.delete(path);
  return path;
}

export async function removeStoredImage(userId: string, imageValue: string | null | undefined) {
  const path = getStoragePath(imageValue);
  if (!path || !path.startsWith(`${userId}/`)) return;

  const { error } = await getSupabase().storage.from(STORAGE_BUCKET).remove([path]);
  if (error) {
    console.warn('Failed to remove stored image:', error.message);
  }
  signedUrlCache.delete(path);
}

function getSafeExtension(name: string) {
  const clean = name.split('?')[0]?.split('#')[0] ?? '';
  const extension = clean.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(extension)) return extension;
  return 'jpg';
}

function getContentType(extension: string) {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic') return 'image/heic';
  return 'image/jpeg';
}

function makeRandomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

