import { promises as fs } from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

// Create multiple sized icons from the source image
async function generateIcons() {
  try {
    const sizes = [16, 32, 48, 128];
    const sourceImagePath = path.join(process.cwd(), 'attached_assets', 'wally-icon.png');
    const targetDir = path.join(process.cwd(), 'extension', 'icons');
    
    console.log(`Reading source image from: ${sourceImagePath}`);
    
    // Ensure the target directory exists
    await fs.mkdir(targetDir, { recursive: true });
    
    // Load the source image
    const image = await loadImage(sourceImagePath);
    
    // Generate each size
    for (const size of sizes) {
      // Create a canvas of the required size
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      
      // Draw the image with smooth rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw the image onto the canvas, scaling it to fit
      ctx.drawImage(image, 0, 0, size, size);
      
      // Convert canvas to buffer and save as PNG
      const buffer = canvas.toBuffer('image/png');
      const outputPath = path.join(targetDir, `icon${size}.png`);
      
      await fs.writeFile(outputPath, buffer);
      console.log(`Generated icon: ${outputPath}`);
    }
    
    console.log('Icon generation complete!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

// Run the function
generateIcons();