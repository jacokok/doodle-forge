import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  canonicalJson,
  sha256,
  type CharacterManifest,
} from '@doodleforge/contracts';
import { ArtifactStore, manifestStage, type StageContext } from './index.js';

it('joins verified selected PNGs and rejects missing or unselected sheets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'manifest-stage-'));
  try {
    const store = new ArtifactStore(root);
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../contracts/fixtures/sprout/v1/character.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as CharacterManifest;
    const branches = ['idle', 'walk', 'attack', 'hurt', 'ko'] as const;
    const names = ['idle', 'walk', 'attack_light', 'hurt', 'knockout'] as const;
    const signal = new AbortController().signal;
    const deps = [];
    for (let i = 0; i < branches.length; i++) {
      const anim = fixture.animations[names[i]!]!;
      const asset = fixture.assets[anim.assetId]!;
      const claim = {
        stepId: randomUUID(),
        attemptId: randomUUID(),
      } as StageContext['claim'];
      const bytes = readFileSync(
        new URL(
          `../../contracts/fixtures/sprout/v1/${asset.path}`,
          import.meta.url,
        ),
      );
      const image = await store.putPng(claim, bytes, signal);
      const output = {
        animation: branches[i],
        image,
        sourceSha256s: Array(anim.frameCount).fill(image.sha256),
        frameWidth: 256,
        frameHeight: 256,
        frameCount: anim.frameCount,
        columns: anim.columns,
        footAnchor: anim.footAnchor,
        style: fixture.artStyle,
        resolvedInputHash: 'a'.repeat(64),
      };
      const outputJson = canonicalJson(output);
      deps.push({
        stepId: claim.stepId,
        attemptId: claim.attemptId,
        stageKey: 'pack-sheet',
        stageVersion: '1',
        targetKey: branches[i]!,
        outputJson,
        outputHash: sha256(outputJson),
      });
    }
    const {
      name,
      description,
      bodyType,
      artStyle,
      stats,
      facing,
      anchors,
      attacks,
      hitboxes,
      hurtboxes,
      abilities,
      effects,
    } = fixture;
    const timing = Object.fromEntries(
      branches.map((b, i) => [
        b,
        {
          fps: fixture.animations[names[i]!]!.fps,
          loop: fixture.animations[names[i]!]!.loop,
        },
      ]),
    );
    const stage = manifestStage();
    const input = stage.inputSchema.parse({
      schemaVersion: 1,
      characterId: fixture.characterId,
      characterVersion: fixture.characterVersion,
      sourceSnapshotHash: 'b'.repeat(64),
      inputs: {
        character: { name, description, bodyType, artStyle },
        gameplay: {
          stats,
          facing,
          anchors,
          attacks,
          hitboxes,
          hurtboxes,
          abilities,
          effects,
        },
        timing,
      },
      parameters: { style: artStyle },
    });
    const context: StageContext = {
      claim: {} as StageContext['claim'],
      signal,
      log: () => {},
      artifacts: store,
      dependencyOutputs: deps,
      resolvedInputHash: 'c'.repeat(64),
      targetKey: '',
    };
    const result = await stage.execute(context, input);
    expect(result.sha256).toBe(sha256(canonicalJson(result.manifest)));
    expect(result.sheets).toHaveLength(5);
    for (const asset of Object.values(result.manifest.assets)) {
      expect(asset.path).toBe(`assets/${asset.sha256}.png`);
    }
    await expect(
      stage.execute(context, {
        ...input,
        inputs: {
          ...input.inputs,
          gameplay: {
            ...input.inputs.gameplay,
            anchors: { ...input.inputs.gameplay.anchors, feet: { x: 0, y: 0 } },
          },
        },
      }),
    ).rejects.toThrow('foot anchor');
    await expect(
      stage.execute(
        {
          ...context,
          dependencyOutputs: deps.map((d, i) =>
            i ? d : { ...d, attemptId: randomUUID() },
          ),
        },
        input,
      ),
    ).rejects.toThrow('Unselected');
    await expect(
      stage.execute({ ...context, dependencyOutputs: deps.slice(1) }, input),
    ).rejects.toThrow('dependency');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
