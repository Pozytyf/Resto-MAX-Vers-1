export interface PresetDishImage {
  id: string;
  labelKey: string;
  url: string;
}

export const PRESET_DISH_IMAGES: PresetDishImage[] = [
  {
    id: 'capitaine',
    labelKey: 'menu.presetCapitaine',
    url: '/src/assets/images/dish_capitaine_attieke_1795030466633.jpg',
  },
  {
    id: 'poulet',
    labelKey: 'menu.presetPoulet',
    url: '/src/assets/images/dish_poulet_braise_1795030475827.jpg',
  },
  {
    id: 'bissap',
    labelKey: 'menu.presetBissap',
    url: '/src/assets/images/drink_bissap_signature_1795030467101.jpg',
  },
];

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validateMenuImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > 600_000) return false;
  if (/^\/[a-zA-Z0-9._\-\/]+$/.test(trimmed)) return true;
  if (/^https?:\/\/[^\s<>"]+$/.test(trimmed)) return true;
  if (
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire le fichier image.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Impossible de lire le fichier image.'));
    reader.readAsDataURL(file);
  });
}

export async function optimizeImageFileToDataUrl(
  file: File,
  maxWidth = 800,
  maxHeight = 600,
  quality = 0.82,
): Promise<string> {
  if (!ALLOWED_IMAGE_MIME.has(file.type.toLowerCase())) {
    throw new Error('Format non supporté (JPG, PNG, WebP ou GIF uniquement).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Fichier trop lourd (maximum 8 Mo avant compression).');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return rawDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(
        1,
        maxWidth / Math.max(1, img.width),
        maxHeight / Math.max(1, img.height),
      );
      const targetWidth = Math.max(1, Math.round(img.width * ratio));
      const targetHeight = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const outputMime =
        file.type === 'image/png' && rawDataUrl.length < 220_000
          ? 'image/png'
          : 'image/jpeg';
      const compressed = canvas.toDataURL(outputMime, quality);
      if (compressed.length > 580_000) {
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      } else {
        resolve(compressed);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}
