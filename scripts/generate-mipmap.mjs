import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoSrc = path.join(__dirname, '..', 'assets', 'images', 'zena-logo.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

for (const [folder, size] of Object.entries(sizes)) {
  const dir = path.join(resDir, folder);
  const fgSize = Math.round(size * 0.55);

  // ic_launcher.webp
  await sharp(logoSrc)
    .resize(size, size, { fit: 'contain', background: '#E3F2FD' })
    .webp()
    .toFile(path.join(dir, 'ic_launcher.webp'));

  // ic_launcher_round.webp
  await sharp(logoSrc)
    .resize(size, size, { fit: 'contain', background: '#E3F2FD' })
    .webp()
    .toFile(path.join(dir, 'ic_launcher_round.webp'));

  // ic_launcher_foreground.webp
  const fgBuf = await sharp(logoSrc)
    .resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fgBuf, gravity: 'centre' }])
    .webp()
    .toFile(path.join(dir, 'ic_launcher_foreground.webp'));

  // ic_launcher_background.webp
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 227, g: 242, b: 253, alpha: 255 } } })
    .webp()
    .toFile(path.join(dir, 'ic_launcher_background.webp'));

  // ic_launcher_monochrome.webp
  const monoBuf = await sharp(logoSrc)
    .resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .grayscale()
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: monoBuf, gravity: 'centre' }])
    .webp()
    .toFile(path.join(dir, 'ic_launcher_monochrome.webp'));

  console.log(`Done: ${folder} (${size}px)`);
}

console.log('\nAll Android mipmap icons replaced!');
