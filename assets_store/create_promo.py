from PIL import Image, ImageOps
import os

source_path = 'assets_store/banner.png'
output_path = 'assets_store/marquee_promo_1400x560.png'
target_size = (1400, 560)

if os.path.exists(source_path):
    img = Image.open(source_path)
    
    # Resize and crop to fill the target size (Aspect Fill + Center Crop)
    # ImageOps.fit does exactly this: resize to cover and crop from center
    promo_img = ImageOps.fit(img, target_size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    
    promo_img.save(output_path)
    print(f"✅ Created {output_path} ({target_size[0]}x{target_size[1]})")
else:
    print(f"❌ Source file not found: {source_path}")
