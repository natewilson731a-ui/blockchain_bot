const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 64, 192, 512];
const inputImage = path.join(__dirname, '../src/assets/chain.PNG');
const publicDir = path.join(__dirname, '../public');

async function generateIcons() {
  try {
    // Read the PNG file
    const imageBuffer = fs.readFileSync(inputImage);

    // Generate favicon.ico (multiple sizes in one file)
    const faviconSizes = [16, 32, 48];
    const faviconBuffers = await Promise.all(
      faviconSizes.map(size => 
        sharp(imageBuffer)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 51, alpha: 1 } // #000033
          })
          .png()
          .toBuffer()
      )
    );

    // Write favicon.ico
    const faviconPath = path.join(publicDir, 'favicon.ico');
    fs.writeFileSync(faviconPath, Buffer.concat(faviconBuffers));

    // Generate PNG files
    for (const size of [192, 512]) {
      const outputPath = path.join(publicDir, `logo${size}.png`);
      await sharp(imageBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 51, alpha: 1 } // #000033
        })
        .png()
        .toFile(outputPath);
    }

    console.log('Icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generateIcons(); 