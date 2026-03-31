from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os

def remove_bg(image_path, threshold=240):
    img = Image.open(image_path)
    img = img.convert("RGBA")
    data = img.getdata()
    
    newData = []
    for item in data:
        # If very close to white, make transparent
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    
    img.putdata(newData)
    
    # Simple smoothing by blurring the alpha channel a bit and thresholding
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=0.5))
    a = a.point(lambda p: 255 if p > 160 else 0)
    img.putalpha(a)
    
    img.save(image_path, "PNG")
    print(f"Removed background from {image_path}")

new_images = ["pizza_new.png", "fries_new.png", "kebab_new.png", "pita_new.png"]
public_dir = "/Users/jalle/testa/apps/web/public"

for img_name in new_images:
    path = os.path.join(public_dir, img_name)
    if os.path.exists(path):
        remove_bg(path)
