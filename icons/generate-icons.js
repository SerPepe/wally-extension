// Icon Generator Script
// This script converts the SVG icon to multiple PNG sizes
// Required for Chrome extension

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define icon sizes
const ICON_SIZES = [16, 32, 48, 128];

async function generateIcons() {
  try {
    const svgPath = path.join(__dirname, 'icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Convert SVG to data URL
    const svgDataURL = 'data:image/svg+xml;base64,' + Buffer.from(svgContent).toString('base64');
    
    // Load SVG image
    const image = await loadImage(svgDataURL);
    
    // Generate PNG icons for each size
    for (const size of ICON_SIZES) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      
      // Draw image with proper scaling
      ctx.drawImage(image, 0, 0, size, size);
      
      // Save as PNG
      const buffer = canvas.toBuffer('image/png');
      const outputPath = path.join(__dirname, `icon${size}.png`);
      fs.writeFileSync(outputPath, buffer);
      
      console.log(`Generated ${outputPath}`);
    }
    
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

// Run the generator
generateIcons();