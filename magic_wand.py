from PIL import Image, ImageDraw, ImageFilter
import os

def magic_wand_removal(image_path):
    # Open image and ensure RGBA
    img = Image.open(image_path)
    img = img.convert("RGBA")
    width, height = img.size
    
    # Create a mask initialized to fully opaque (white)
    mask = Image.new("L", img.size, 255)
    
    # Target color is the top-left pixel (assumed background)
    target_color = img.getpixel((0, 0))
    
    # Flood-fill from the four corners to find the continuous background
    # We use a thresholded comparison because the background isn't pure white
    def get_mask_value(color):
        # Calculate distance to pure white
        # If the pixel is very light, it's background
        r, g, b, a = color
        if r > 210 and g > 210 and b > 210:
            return 0 # Transparent
        return 255 # Opaque

    # We iterate and create a binary mask first
    datas = img.getdata()
    temp_mask_data = []
    for item in datas:
        temp_mask_data.append(get_mask_value(item))
    
    mask.putdata(temp_mask_data)
    
    # Apply a slight blur and threshold to the mask to smooth the jagged edges
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1))
    mask = mask.point(lambda p: 255 if p > 128 else 0)
    
    # Apply mask to image
    img.putalpha(mask)
    
    # Save back
    img.save(image_path, "PNG")
    print(f"Professional Magic Wand applied to {image_path}")

images = ["pizza.png", "rulle.png", "pommes.png"]
public_dir = "/Users/jalle/testa/apps/web/public"

for img_name in images:
    path = os.path.join(public_dir, img_name)
    if os.path.exists(path):
        magic_wand_removal(path)
