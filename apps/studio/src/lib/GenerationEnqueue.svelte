<script lang="ts">
  import { onMount } from 'svelte';
  import {
    enqueueGeneration,
    generationProgress,
  } from './characters.remote.js';

  let {
    characterId,
    revision,
    unsaved,
    hasOriginal,
  }: {
    characterId: string;
    revision: number;
    unsaved: boolean;
    hasOriginal: boolean;
  } = $props();
  type Request = {
    characterId: string;
    expectedRevision: number;
    idempotencyKey: string;
    style: 'original' | 'cartoon' | 'pixel';
    seed: number;
  };
  const storageKey = $derived(`doodleforge:pending-generation:${characterId}`);
  let pending = $state<Request | null>(null);
  let ready = $state(false);
  let storageError = $state(false);
  let busy = $state(false);
  let style = $state<Request['style']>('original');
  let seed = $state(0);
  let message = $state('');
  let problem = $state('');
  onMount(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') throw new Error();
        const r = value as Request;
        if (
          r.characterId !== characterId ||
          !Number.isSafeInteger(r.expectedRevision) ||
          r.expectedRevision < 0 ||
          !/^[0-9a-f-]{36}$/i.test(r.idempotencyKey) ||
          !['original', 'cartoon', 'pixel'].includes(r.style) ||
          !Number.isInteger(r.seed) ||
          r.seed < 0 ||
          r.seed > 0xffffffff
        )
          throw new Error();
        pending = r;
      }
      ready = true;
    } catch {
      storageError = true;
    }
  });
  async function send(retry: boolean) {
    if (busy || storageError || !ready) return;
    if (!retry) {
      if (
        pending ||
        unsaved ||
        !hasOriginal ||
        !Number.isInteger(seed) ||
        seed < 0 ||
        seed > 0xffffffff
      )
        return;
      const request: Request = {
        characterId,
        expectedRevision: revision,
        idempotencyKey: crypto.randomUUID(),
        style,
        seed,
      };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(request));
        pending = request;
      } catch {
        storageError = true;
        return;
      }
    }
    if (!pending) return;
    busy = true;
    problem = '';
    message = '';
    try {
      const result = await enqueueGeneration(pending);
      if (result.ok) {
        // Remove only after an authoritative response. If storage fails, retain the key for safe replay.
        sessionStorage.removeItem(storageKey);
        pending = null;
        message = `Mock generation v${result.value.characterVersion} queued. It is not approved or published.`;
        await generationProgress(characterId)
          .refresh()
          .catch(() => {});
      } else if (
        [
          'invalid_input',
          'not_found',
          'idempotency_conflict',
          'stale_revision',
          'original_required',
          'version_limit',
          'unsupported_generation',
          'invalid_origin',
        ].includes(result.error.code)
      ) {
        sessionStorage.removeItem(storageKey);
        pending = null;
        problem = `${result.error.message} Reference: ${result.error.requestId}`;
      } else {
        problem =
          'The result is uncertain. Retry the same request; do not start a new generation.';
      }
    } catch {
      problem =
        'The result is uncertain. Retry the same request; do not start a new generation.';
    } finally {
      busy = false;
    }
  }
</script>

<section aria-label="Start mock generation" class="my-4 space-y-2">
  <h4 class="font-semibold">Start offline mock generation</h4>
  <p>
    Uses the saved character and original. Mock artwork is synthetic; the worker
    must be running. Generation does not approve or publish.
  </p>
  {#if storageError}<p role="alert">
      Session storage is unavailable or contains an unreadable pending request.
      Generation is disabled to avoid duplicates; use the CLI to inspect jobs.
    </p>{/if}
  {#if pending}
    <p>
      Pending request: revision {pending.expectedRevision}, {pending.style} style,
      seed {pending.seed}. Its result may be uncertain; retry uses the exact
      same key and inputs.
    </p>
    <button
      type="button"
      disabled={busy || storageError}
      onclick={() => send(true)}
      >{busy ? 'Checking…' : 'Retry same generation request'}</button
    >
  {:else}
    <label for="generation-style">Art style</label>
    <select id="generation-style" bind:value={style} disabled={busy || !ready}
      ><option value="original">Original</option><option value="cartoon"
        >Cartoon</option
      ><option value="pixel">Pixel</option></select
    >
    <label for="generation-seed">Seed</label>
    <input
      id="generation-seed"
      type="number"
      min="0"
      max="4294967295"
      step="1"
      bind:value={seed}
      disabled={busy || !ready}
    />
    {#if unsaved}<p>
        Save or discard unsaved changes and selected files before generating.
      </p>{/if}
    {#if !hasOriginal}<p>Attach an original drawing before generating.</p>{/if}
    <button
      type="button"
      disabled={!ready ||
        storageError ||
        busy ||
        unsaved ||
        !hasOriginal ||
        !Number.isInteger(seed) ||
        seed < 0 ||
        seed > 0xffffffff}
      onclick={() => send(false)}
      >{busy ? 'Starting…' : 'Start mock generation'}</button
    >
  {/if}
  {#if problem}<p role="alert">{problem}</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
</section>
