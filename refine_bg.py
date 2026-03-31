from PIL import Image, ImageDraw
import os

def refine_background_removal(image_path):
    img = Image.open(image_path)
    img = img.convert("RGBA")
    
    # Get the background color from top-left (usually white/off-white)
    bg_color = img.getpixel((0,0))
    
    # Create a mask for the background
    # We use floodfill starting from the four corners to get the outer background
    mask = Image.new("L", img.size, 255)
    draw = ImageDraw.Draw(mask)
    
    # Flood fill from corners with a tolerance
    # Since we don't have a direct tolerance in floodfill, we'll do something else.
    # Actually, a better approach for "dusty" white backgrounds:
    datas = img.getdata()
    newData = []
    
    # If the pixel is very light (nearly white), treat as background
    # We'll use a slightly more aggressive threshold to catch shadows
    threshold = 220 
    
    for item in datas:
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            # Gradually fade out based on how white it is
            # For simplicity, let's just go with a hard threshold for now but higher
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(image_path, "PNG")
    print(f"Refined {image_path}")

images = ["pizza.png", "rulle.png", "pommes.png"]
public_dir = "/Users/jalle/testa/apps/web/public"

for img_name in images:
    path = os.path.join(public_dir, img_name)
    if os.path.exists(path):
        refine_background_removal(path)
