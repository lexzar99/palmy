import * as fs from 'fs';

let content = fs.readFileSync('packages/api/src/routes/restaurants.ts', 'utf-8');

// Remove extraGroups include from items
content = content.replace(/include:\s*{\s*extraGroups:\s*{\s*include:\s*{\s*extraGroup:\s*{\s*include:\s*{\s*extras:\s*true,?\s*},?\s*},?\s*},?\s*},?\s*},?/g, '');
content = content.replace(/include:\s*{\s*extraGroups:\s*{\s*include:\s*{\s*extraGroup:\s*{\s*include:\s*{\s*extras:\s*true\s*}\s*}\s*}\s*}\s*}/g, '');

// There might be some dangling commas, so let's use regex or just plain string replace for the exact blocks in `findMany` and `findUnique`:
const extraGroupInclude = `include: {
                    extraGroups: {
                      include: {
                        extraGroup: {
                          include: { extras: true },
                        },
                      },
                    },
                  },`;
content = content.replace(extraGroupInclude, '');
content = content.replace(extraGroupInclude, '');

// Also the orderBy position for items
const orderItems = `orderBy: { position: 'asc' },`;
const includeItemsBase = `include: { 
                  items: { 
                    orderBy: { position: 'asc' },
                    include: {
                      extraGroups: {
                        include: {
                          extraGroup: {
                            include: { extras: true }
                          }
                        }
                      }
                    }
                  } 
                }`;
const targetIncludeItems = `include: { items: true }`;

content = content.replace(includeItemsBase, targetIncludeItems);
// do it multiple times for findUnique and findMany
content = content.replace(includeItemsBase, targetIncludeItems);
content = content.replace(/include:\s*\{\s*items:\s*\{\s*orderBy:\s*\{\s*position:\s*'asc'\s*\},?\s*include:\s*\{\s*extraGroups:\s*\{[\s\S]*extras:\s*true\s*\}\s*\}\s*\}\s*\}\s*\}\s*\}/g, 'include: { items: true }');

// Try a more simple replacement:
// Anything between items: { ... } needs to become items: true
content = content.replace(/items:\s*\{\s*orderBy:\s*\{\s*position:\s*'asc'\s*\},[\s\S]*?\}[\s\n]*\}([\s\n]*\})/g, 'items: true$1');

fs.writeFileSync('packages/api/src/routes/restaurants.ts', content);
