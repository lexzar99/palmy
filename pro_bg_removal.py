from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os

def professional_bg_removal(image_path):
    # Open image and ensure RGBA
    img = Image.open(image_path)
    img = img.convert("RGBA")
    width, height = img.size
    
    # 1. Create a binary mask of "background-like" pixels
    # We identify background as anything very close to the top-left pixel color
    # or generally "white-ish"
    data = img.getdata()
    
    # Threshold for "white-ish" background
    # We use a lower threshold to catch more of the halo
    threshold = 200 
    
    mask_data = []
    for item in data:
        # If r, g, b are all above threshold, it's likely background
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            mask_data.append(0) # Transparent in mask
        else:
            mask_data.append(255) # Opaque in mask
            
    mask = Image.new("L", img.size)
    mask.putdata(mask_data)
    
    # 2. Refine the mask
    # Erode the mask to remove the "halo" (jagged white edges)
    # We can do this by applying a MinFilter or just a blur + threshold
    mask = mask.filter(ImageFilter.MinFilter(3)) # Erode by 1 pixel (3x3 kernel)
    
    # 3. Feather the edges
    # Apply a slight Gaussian blur to the mask to make the edges soft and professional
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.5))
    
    # 4. Apply the mask back to the original image
    img.putalpha(mask)
    
    # 5. Save the result
    img.save(image_path, "PNG")
    print(f"Professional background removal (eroded & feathered) applied to {image_path}")

images = ["pizza.png", "rulle.png", "pommes.png"]
public_dir = "/Users/jalle/testa/apps/web/public"

for img_name in images:
    path = os.path.join(public_dir, img_name)
    if os.path.exists(path):
        professional_bg_removal(path)
