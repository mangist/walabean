import { ISLAND_HEIGHT, MAX_PLAYERS } from './constants.js';
import { islandLayout } from './worldLayout.js';

// World items: pickup rocks scattered on the sand and coconuts hanging in
// palms. state: 'ground' (can be picked up) | 'tree' (must be knocked down
// first) | 'gone' (picked up).
export function createItems() {
  const items = new Map();
  for (let islandId = 0; islandId < MAX_PLAYERS; islandId++) {
    const layout = islandLayout(islandId);
    for (const rock of layout.pickupRocks) {
      items.set(rock.id, {
        id: rock.id,
        kind: 'rock',
        state: 'ground',
        position: { x: rock.x, y: ISLAND_HEIGHT, z: rock.z },
      });
    }
    for (const coco of layout.coconuts) {
      items.set(coco.id, {
        id: coco.id,
        kind: 'coconut',
        state: 'tree',
        position: { x: coco.x, y: coco.y, z: coco.z },
        groundPosition: { x: coco.groundX, y: ISLAND_HEIGHT, z: coco.groundZ },
      });
    }
  }
  return items;
}
