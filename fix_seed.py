import re

with open('packages/api/src/routes/restaurants.ts', 'r') as f:
    content = f.read()

# Remove isPopular: true
content = re.sub(r',\s*isPopular:\s*true', '', content)

# Function to add slug property safely
def add_slug(match):
    name = match.group(1)
    # create slug from name
    slug = name.lower().replace('&', 'och').replace(' ', '-').replace('ä', 'a').replace('å', 'a').replace('ö', 'o').replace('é', 'e').replace("'", '')
    # remove special chars
    slug = re.sub(r'[^a-z0-9\-]', '', slug)
    return f"name: '{name}', slug: '{slug}'"

# Replace name: 'Name' with name: 'Name', slug: 'name'
content = re.sub(r"name:\s*'([^']+)'", add_slug, content)

with open('packages/api/src/routes/restaurants.ts', 'w') as f:
    f.write(content)
