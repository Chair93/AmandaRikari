/** Re-encodes a photo on-device before upload: capped at 1600px on the long
 *  side, JPEG ~80%. A 4MB camera shot becomes ~300KB and stays perfectly
 *  readable for an anamnese form. Redrawing through a canvas also strips
 *  EXIF metadata — including GPS coordinates — from the original file. */
export function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    // FileReader → data: URL, NOT URL.createObjectURL: the app's CSP allows
    // img-src data: but blocks blob:, so an object URL would fail for every
    // image and look like a corrupt file.
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui abrir esse arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
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
      img.onerror = () =>
        reject(new Error('Não consegui ler essa imagem — se for HEIC (padrão do iPhone), converta pra JPEG ou envie pelo próprio celular.'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
