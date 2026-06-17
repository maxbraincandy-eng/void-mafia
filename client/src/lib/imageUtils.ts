export async function compressImage(
  file: File,
  maxPx = 1080,
  quality = 0.78,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) {
            height = Math.round(height * maxPx / width);
            width = maxPx;
          } else {
            width = Math.round(width * maxPx / height);
            height = maxPx;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Try at requested quality; if still >500KB base64, drop quality further
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length > 680_000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.60);
        }
        if (dataUrl.length > 680_000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.45);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
