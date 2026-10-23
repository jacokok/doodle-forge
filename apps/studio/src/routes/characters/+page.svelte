<script lang="ts">
  import { tick } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    characterMetadataSchema,
    originalUploadPolicy,
    type CharacterMetadata,
  } from '@doodleforge/contracts/authoring';
  import {
    library,
    createCharacter,
    editCharacter,
    archiveCharacter,
  } from '../../lib/characters.remote.js';

  type Character = Extract<
    Awaited<ReturnType<typeof createCharacter>>,
    { ok: true }
  >['value'];
  type Failure = Omit<
    Extract<
      Awaited<ReturnType<typeof createCharacter>>,
      { ok: false }
    >['error'],
    'requestId'
  > & { requestId: string };
  const catalog = library();
  let selected = $state<Character | null>(null);
  let editing = $state(false);
  let name = $state('');
  let description = $state('');
  let bodyType = $state<CharacterMetadata['bodyType']>('humanoid');
  let busy = $state(false);
  let failure = $state<Failure | null>(null);
  let notice = $state('');
  let confirming = $state(false);
  let nameInput = $state<HTMLInputElement>();
  let cancelArchive = $state<HTMLButtonElement>();
  const bodyTypes = characterMetadataSchema.shape.bodyType.options;
  const stale = $derived(failure?.code === 'stale_revision');
  const blocked = $derived(stale || failure?.code === 'connection_error');
  let archiveButton = $state<HTMLButtonElement>();
  let imageFile = $state<File | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let previewFailed = $state(false);

  async function uploadOriginal() {
    if (!selected || !imageFile || busy || blocked) return;
    busy = true;
    failure = null;
    notice = '';
    try {
      const form = new FormData();
      form.set('image', imageFile);
      form.set('expectedRevision', String(selected.editRevision));
      const response = await fetch(
        resolve('/api/characters/[id]/originals', { id: selected.id }),
        { method: 'POST', body: form },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error: Failure };
        failure = result.error;
        return;
      }
      selected = (await response.json()) as Character;
      imageFile = null;
      if (fileInput) fileInput.value = '';
      previewFailed = false;
      notice =
        'Original attached. Unsaved metadata is kept below. No version or job was created.';
      await catalog.refresh();
    } catch {
      failure = {
        code: 'connection_error',
        message:
          'Could not confirm upload. Your input is kept. Reload before retrying; the image may have been attached.',
        fieldErrors: undefined,
        requestId: '',
      };
    } finally {
      busy = false;
    }
  }

  async function open(character: Character | null) {
    selected = character;
    imageFile = null;
    if (fileInput) fileInput.value = '';
    previewFailed = false;
    name = character?.name ?? '';
    description = character?.description ?? '';
    bodyType = character
      ? characterMetadataSchema.shape.bodyType.parse(character.bodyType)
      : 'humanoid';
    editing = true;
    confirming = false;
    failure = null;
    notice = '';
    await tick();
    nameInput?.focus();
  }

  async function save() {
    if (busy || blocked) return;
    busy = true;
    failure = null;
    notice = '';
    try {
      const metadata = { name, description, bodyType };
      const result = selected
        ? await editCharacter({
            id: selected.id,
            input: { ...metadata, expectedRevision: selected.editRevision },
          })
        : await createCharacter(metadata);
      if (!result.ok) {
        failure = result.error;
        return;
      }
      selected = result.value;
      name = result.value.name;
      description = result.value.description;
      bodyType = characterMetadataSchema.shape.bodyType.parse(
        result.value.bodyType,
      );
      notice = 'Metadata saved. No version or job was created.';
      await catalog.refresh();
    } catch {
      notice = '';
      failure = {
        code: 'connection_error',
        message:
          'Could not confirm the result. Your input is kept. Reload the library before retrying; the change may have reached the server.',
        fieldErrors: undefined,
        requestId: '',
      };
    } finally {
      busy = false;
    }
  }

  async function reload() {
    if (busy) return;
    busy = true;
    try {
      await catalog.refresh();
      if (catalog.current?.ok && !selected) {
        failure = null;
        notice =
          'Library reloaded. Check for any previously saved character before creating another.';
      }
      if (catalog.current?.ok && selected) {
        const latest = catalog.current.value.find(
          (item) => item.id === selected?.id,
        );
        if (latest) await open(latest);
        else {
          editing = false;
          selected = null;
          notice = 'This character is no longer in the authoring library.';
        }
      }
    } catch {
      notice = 'Library reload failed. Your input is kept; try again.';
    } finally {
      busy = false;
    }
  }

  async function confirmArchive() {
    confirming = true;
    await tick();
    cancelArchive?.focus();
  }

  async function archive() {
    if (!selected || busy || blocked) return;
    busy = true;
    failure = null;
    notice = '';
    try {
      const result = await archiveCharacter({
        id: selected.id,
        input: { expectedRevision: selected.editRevision },
      });
      if (!result.ok) {
        failure = result.error;
        return;
      }
      editing = false;
      selected = null;
      confirming = false;
      notice =
        'Character archived from authoring. Published content is unchanged.';
      await catalog.refresh();
    } catch {
      failure = {
        code: 'connection_error',
        message:
          'Could not confirm archive. Reload the library before retrying.',
        fieldErrors: undefined,
        requestId: '',
      };
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Character library — DoodleForge</title></svelte:head>
<main class="mx-auto max-w-5xl p-6">
  <a href={resolve('/')}>DoodleForge home</a>
  <h1 class="my-4 text-3xl font-bold">Character library</h1>
  <p>
    Metadata and private original art authoring. Editing or archiving never
    changes published content.
  </p>
  <p class="my-3">
    Creative choices, generation, versions, review and publishing are not
    available in this UI. No factory jobs are running here.
  </p>
  <div class="my-5 flex flex-wrap gap-3">
    <button disabled={busy} onclick={() => open(null)}>New character</button>
    <button disabled={busy || catalog.loading} onclick={reload}
      >Reload library{selected ? ' and discard local edits' : ''}</button
    >
  </div>
  <p role="status">{busy ? 'Working… Please wait.' : notice}</p>
  {#if failure}
    <div role="alert" class="my-4 border-2 border-red-700 p-4">
      <p>{failure.message}</p>
      {#if stale}<p>
          Your input is kept below. Copy it if needed, then use “Reload library
          and discard local edits” to review the latest revision. Saving and
          archiving are blocked until reload.
        </p>{/if}
      {#each Object.entries(failure.fieldErrors ?? {}) as [field, messages] (field)}
        <p id="error-{field}">{field}: {messages.join(' ')}</p>
      {/each}
      {#if failure.requestId}<p class="text-sm">
          Reference: {failure.requestId}
        </p>{/if}
    </div>
  {/if}
  <div class="grid gap-8 md:grid-cols-2">
    <section aria-label="Library" aria-busy={catalog.loading}>
      <h2 class="text-xl font-semibold">Characters</h2>
      {#if catalog.loading}<p role="status">Loading library…</p>{/if}
      {#if catalog.error}<p role="alert">
          Library unavailable. Use Reload library to retry.
        </p>{/if}
      {#if catalog.current}
        {#if catalog.current.ok}
          {#if catalog.current.value.length === 0}<p>
              No characters yet. Create one to begin.
            </p>{/if}
          <ul class="my-3 space-y-3">
            {#each catalog.current.value as character (character.id)}
              <li class="rounded border border-slate-300 p-3">
                <button
                  disabled={busy}
                  onclick={() => open(character)}
                  aria-pressed={selected?.id === character.id}
                  >{character.name}</button
                >
                <p class="whitespace-pre-wrap break-words">
                  {character.description}
                </p>
                <p>
                  {character.bodyType} · Metadata revision {character.editRevision}
                </p>
              </li>
            {/each}
          </ul>
        {:else}<p role="alert">
            {catalog.current.error.message} Reference: {catalog.current.error
              .requestId}
          </p>{/if}
      {/if}
    </section>
    {#if editing}
      <section aria-label="Metadata editor" aria-busy={busy}>
        <h2 class="text-xl font-semibold">
          {selected ? 'Edit character' : 'Create character'}
        </h2>
        {#if selected}<p>
            Editing metadata revision {selected.editRevision}
          </p>{/if}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          novalidate
        >
          <fieldset disabled={busy || confirming} class="space-y-4">
            <div>
              <label for="name">Name</label><input
                bind:this={nameInput}
                id="name"
                bind:value={name}
                aria-invalid={!!failure?.fieldErrors?.name}
                aria-describedby={failure?.fieldErrors?.name
                  ? 'error-name'
                  : undefined}
              />
            </div>
            <div>
              <label for="description">Description</label><textarea
                id="description"
                rows="5"
                bind:value={description}
                aria-invalid={!!failure?.fieldErrors?.description}
                aria-describedby={failure?.fieldErrors?.description
                  ? 'error-description'
                  : undefined}></textarea>
            </div>
            <div>
              <label for="body-type">Body type</label><select
                id="body-type"
                bind:value={bodyType}
                >{#each bodyTypes as type (type)}<option value={type}
                    >{type}</option
                  >{/each}</select
              >
            </div>
            <button type="submit" disabled={blocked}
              >{busy ? 'Saving…' : 'Save metadata'}</button
            >
          </fieldset>
        </form>
        {#if selected}
          <section aria-label="Original art" class="my-6 space-y-3">
            <h3 class="text-lg font-semibold">Private original art</h3>
            <p>
              Still JPEG, PNG or WebP; up to 10 MiB and 20 megapixels. Attaching
              replaces the selected original, retaining earlier art immutably.
              Unsaved metadata is not submitted.
            </p>
            {#if selected.originalAssetId}
              {#key selected.originalAssetId}
                <img
                  class="max-h-80 max-w-full object-contain"
                  src={resolve(
                    '/api/characters/[id]/originals/[assetId]/[kind]',
                    {
                      id: selected.id,
                      assetId: selected.originalAssetId,
                      kind: 'preview',
                    },
                  )}
                  alt="Private preview of the attached original drawing"
                  onerror={() => {
                    previewFailed = true;
                  }}
                />
              {/key}
              {#if previewFailed}<p role="alert">
                  Private preview unavailable. Reload or try opening it again;
                  no generated art is substituted.
                </p>{/if}
              <a
                href={resolve(
                  '/api/characters/[id]/originals/[assetId]/[kind]',
                  {
                    id: selected.id,
                    assetId: selected.originalAssetId,
                    kind: 'original',
                  },
                )}
                target="_blank"
                rel="noreferrer">Open private original (new tab)</a
              >
            {:else}<p>No original attached.</p>{/if}
            <form
              onsubmit={(event) => {
                event.preventDefault();
                void uploadOriginal();
              }}
            >
              <fieldset disabled={busy || blocked || confirming}>
                <label for="original-image">Original image</label>
                <input
                  bind:this={fileInput}
                  id="original-image"
                  type="file"
                  accept={originalUploadPolicy.mediaTypes.join(',')}
                  onchange={(event) => {
                    imageFile = event.currentTarget.files?.[0] ?? null;
                  }}
                />
                <button type="submit" disabled={!imageFile}
                  >{busy
                    ? 'Uploading…'
                    : selected.originalAssetId
                      ? 'Replace original'
                      : 'Attach original'}</button
                >
              </fieldset>
            </form>
          </section>
          <div class="my-6">
            {#if confirming}
              <div
                role="group"
                aria-label="Confirm archive"
                class="border-2 border-slate-500 p-4"
              >
                <p>
                  Archive “{selected.name}” from authoring? Unsaved edits will
                  be discarded. Published content will not be revoked.
                </p>
                <button
                  bind:this={cancelArchive}
                  disabled={busy}
                  onclick={async () => {
                    confirming = false;
                    await tick();
                    archiveButton?.focus();
                  }}>Cancel archive</button
                >
                <button disabled={busy || blocked} onclick={archive}
                  >Confirm archive</button
                >
              </div>
            {:else}<button
                bind:this={archiveButton}
                disabled={busy || blocked}
                onclick={confirmArchive}>Archive character</button
              >{/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</main>
