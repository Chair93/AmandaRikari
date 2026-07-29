/** Re-encodes a photo on-device before upload: capped at 1600px on the long
 *  side, JPEG ~80%. A 4MB camera shot becomes ~300KB and stays perfectly
 *  readable for an anamnese form. Redrawing through a canvas also strips
 *  EXIF metadata — including GPS coordinates — from the original file. */
export function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas indisponível'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui ler essa imagem.'));
    };
    img.src = url;
  });
}
