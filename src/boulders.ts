import { Tile, TileType, FallingBoulder } from './types';
import { TILE_SIZE, ROCK_HARDNESS } from './constants';
import { PlayerExtendedState, getDamageReductionFactor, PLAYER_WIDTH, PLAYER_HEIGHT, GRAVITY } from './player';
import { sounds } from './audio';
import { addFloatingText, addShockwave } from './effects';

let nextBoulderId = 1;
export const activeBoulders: FallingBoulder[] = [];

export function resetBoulders(): void {
  activeBoulders.length = 0;
}

/**
 * Checks if a cleared block at (gx, gy) leaves a rock above it without support.
 * If so, the rock enters unstable tremble state and falls!
 */
export function checkAndTriggerFallingRock(world: Tile[][], gx: number, gy: number): void {
  const aboveGy = gy - 1;
  if (aboveGy <= 3) return; // Don't trigger surface blocks

  const tileAbove = world[aboveGy]?.[gx];
  if (!tileAbove || tileAbove.type !== TileType.ROCK) return;

  // Verify the block below the rock is indeed empty and doesn't have an elevator
  const tileBelow = world[aboveGy + 1]?.[gx];
  if (tileBelow && (tileBelow.type !== TileType.EMPTY || tileBelow.hasElevator)) return;

  // Verify not already active
  if (activeBoulders.some(b => b.gx === gx && b.gy === aboveGy)) return;

  // Turn the static rock tile into EMPTY so it moves as an active physical boulder
  world[aboveGy][gx] = {
    type: TileType.EMPTY,
    hardness: 0,
    revealed: tileAbove.revealed ?? true
  };

  activeBoulders.push({
    id: nextBoulderId++,
    gx,
    gy: aboveGy,
    x: gx * TILE_SIZE,
    y: aboveGy * TILE_SIZE,
    vy: 0,
    state: 'tremble',
    trembleTimer: 0.45 // 450ms tremble warning before dropping
  });

  sounds.playImpactSound(25);
}

/**
 * Updates all falling boulders with gravity, player collision, and grid settling.
 */
export function updateBoulders(
  dt: number,
  world: Tile[][],
  player: PlayerExtendedState
): void {
  for (let i = activeBoulders.length - 1; i >= 0; i--) {
    const b = activeBoulders[i];

    if (b.state === 'tremble') {
      b.trembleTimer -= dt;
      if (b.trembleTimer <= 0) {
        b.state = 'falling';
        b.vy = 60; // Initial downward drop speed
      }
      continue;
    }

    // 1. Falling Physics
    b.vy += GRAVITY * 1.35 * dt;
    b.y += b.vy * dt;

    // 2. Collision with Player
    const pLeft = player.x + 2;
    const pRight = player.x + PLAYER_WIDTH - 2;
    const pTop = player.y + 2;
    const pBottom = player.y + PLAYER_HEIGHT - 2;

    const bLeft = b.x + 4;
    const bRight = b.x + TILE_SIZE - 4;
    const bTop = b.y + 4;
    const bBottom = b.y + TILE_SIZE - 4;

    if (bLeft < pRight && bRight > pLeft && bTop < pBottom && bBottom > pTop) {
      // Crush impact on Player (mitigated by hull upgrade and obsidian tablet relic)
      let armorFactor = getDamageReductionFactor(player.upgrades.hull);
      if (player.discoveredRelics?.includes('obsidian_tablet')) {
        armorFactor *= 0.75;
      }
      const damage = Math.round(55 * armorFactor);
      player.hull = Math.max(0, player.hull - damage);
      player.vy = Math.max(player.vy, b.vy * 0.65); // Downward slam impulse
      sounds.playImpactSound(damage * 3);
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 16, `-${damage} KAYA EZMESİ!`, '#ef4444');
      addShockwave(b.x + TILE_SIZE / 2, b.y + TILE_SIZE / 2, 45);
    }

    // 3. Collision with Ground / Tile beneath (including steel elevator ceiling protection)
    const currentBottomRow = Math.floor((b.y + TILE_SIZE - 2) / TILE_SIZE);
    const belowTile = world[currentBottomRow]?.[b.gx];

    if (belowTile && (belowTile.type !== TileType.EMPTY || belowTile.hasElevator)) {
      // Land and settle on top of this solid block or reinforced elevator shaft
      const settleRow = Math.max(4, currentBottomRow - 1);
      if (settleRow >= 0 && settleRow < world.length) {
        world[settleRow][b.gx] = {
          type: TileType.ROCK,
          hardness: ROCK_HARDNESS,
          revealed: true
        };
        sounds.playImpactSound(70);
        addShockwave(b.x + TILE_SIZE / 2, settleRow * TILE_SIZE + TILE_SIZE / 2, 28);

        // Chain Reaction: check if another rock was resting above this settled rock!
        checkAndTriggerFallingRock(world, b.gx, settleRow);
      }
      activeBoulders.splice(i, 1);
    }
  }
}

/**
 * Renders all active falling boulders with tremble vibration or fall trail.
 */
export function renderBoulders(
  ctx: CanvasRenderingContext2D,
  cameraY: number
): void {
  if (activeBoulders.length === 0) return;

  const now = performance.now();

  for (const b of activeBoulders) {
    let drawX = b.x;
    let drawY = b.y - cameraY;

    if (b.state === 'tremble') {
      // Horizontal jitter shake
      const jitter = Math.sin(now * 0.08 + b.id * 10) * 2.8;
      drawX += jitter;

      // Warning sparks/dust indicator above
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(drawX + TILE_SIZE / 2, drawY + TILE_SIZE - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw the heavy rock boulder
    ctx.save();

    // Dark outer granite
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(drawX + 2, drawY + 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
    ctx.fill();
    ctx.stroke();

    // Internal angular facets
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(drawX + 8, drawY + 8);
    ctx.lineTo(drawX + TILE_SIZE - 12, drawY + 12);
    ctx.lineTo(drawX + TILE_SIZE - 8, drawY + TILE_SIZE - 14);
    ctx.lineTo(drawX + 12, drawY + TILE_SIZE - 8);
    ctx.closePath();
    ctx.fill();

    // Crack lines
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(drawX + 14, drawY + 10);
    ctx.lineTo(drawX + 24, drawY + 26);
    ctx.lineTo(drawX + 36, drawY + 32);
    ctx.moveTo(drawX + 24, drawY + 26);
    ctx.lineTo(drawX + 16, drawY + 38);
    ctx.stroke();

    // Specular highlight edge
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(drawX + 6, drawY + TILE_SIZE - 10);
    ctx.lineTo(drawX + 6, drawY + 6);
    ctx.lineTo(drawX + TILE_SIZE - 10, drawY + 6);
    ctx.stroke();

    ctx.restore();
  }
}
