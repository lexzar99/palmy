from PIL import Image
import os

def remove_white_background(image_path):
    img = Image.open(image_path)
    img = img.convert("RGBA")

    datas = img.getdata()

    newData = []
    for item in datas:
        # If the pixel is very close to white, make it transparent
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(image_path, "PNG")
    print(f"Processed {image_path}")

images = ["pizza.png", "rulle.png", "pommes.png"]
public_dir = "/Users/jalle/testa/apps/web/public"

for img_name in images:
    path = os.path.join(public_dir, img_name)
    if os.path.exists(path):
        remove_white_background(path)
    else:
        print(f"Skipping {img_name}, file not found.")
