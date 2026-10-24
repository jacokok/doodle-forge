<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { beforeNavigate } from '$app/navigation';
  import { characterManifestSchema } from '@doodleforge/contracts/manifest';
  import {
    characterMetadataSchema,
    originalUploadPolicy,
    fightingStyleChoices,
    specialPowerChoices,
    type CharacterMetadata,
  } from '@doodleforge/contracts/authoring';
  import {
    library,
    createCharacter,
    editCharacter,
    archiveCharacter,
    versionHistory,
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
  let fightingStyle = $state('unselected');
  let specialPower = $state('none');
  const knownStyle = $derived(
    fightingStyleChoices.some((choice) => choice.value === fightingStyle),
  );
  const knownPower = $derived(
    specialPowerChoices.some((choice) => choice.value === specialPower),
  );
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
  let frozenArtworkFailed = $state(false);
  let frozenArtworkLoading = $state(false);
  let selectedVersionId = $state('');
  let selectedAnimationName = $state('');
  let previewFrame = $state(0);
  let reducedMotion = $state(false);
  const steps = ['Character details', 'Private original', 'Review and history'];
  let step = $state(0);
  let stepHeading = $state<HTMLHeadingElement>();
  const unsaved = $derived(
    editing &&
      (name !== (selected?.name ?? '') ||
        description !== (selected?.description ?? '') ||
        bodyType !== (selected?.bodyType ?? 'humanoid') ||
        fightingStyle !== (selected?.fightingStyle ?? 'unselected') ||
        specialPower !== (selected?.specialPower ?? 'none') ||
        imageFile !== null),
  );

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reducedMotion = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });

  $effect(() => {
    const active = step === 2 && !reducedMotion && Boolean(selectedVersionId);
    const characterId = selected?.id;
    const versionId = selectedVersionId;
    if (!active || !characterId || !versionId) return;
    const result = versionHistory(characterId).current;
    if (!result?.ok) return;
    const frozen = result.value.find((item) => item.id === versionId);
    if (!frozen?.snapshotAvailable || !frozen.snapshot) return;
    const parsed = characterManifestSchema.safeParse(frozen.snapshot);
    if (!parsed.success) return;
    const names = Object.keys(parsed.data.animations).sort();
    const name = names.includes(selectedAnimationName)
      ? selectedAnimationName
      : names[0];
    const animation = name ? parsed.data.animations[name] : undefined;
    if (!animation || animation.frameCount <= 1) return;
    const delay = 1000 / animation.fps;
    const timer = window.setInterval(() => {
      if (!animation.loop && previewFrame >= animation.frameCount - 1) {
        window.clearInterval(timer);
        return;
      }
      previewFrame = animation.loop
        ? (previewFrame + 1) % animation.frameCount
        : Math.min(previewFrame + 1, animation.frameCount - 1);
    }, delay);
    return () => window.clearInterval(timer);
  });

  beforeNavigate((navigation) => {
    if (!unsaved && !busy) return;
    // Cancelling an unloading navigation invokes the browser's native warning.
    if (
      navigation.willUnload ||
      !window.confirm(
        'Leave this editor? Unsaved input and selected files will be lost.',
      )
    )
      navigation.cancel();
  });

  async function requestOpen(character: Character | null) {
    if (busy) return;
    if (
      unsaved &&
      !window.confirm(
        'Discard unsaved input and selected files to open another character?',
      )
    )
      return;
    await open(character);
  }

  async function goToStep(next: number) {
    if (
      busy ||
      confirming ||
      next < 0 ||
      next >= steps.length ||
      (!selected && next > 0)
    )
      return;
    step = next;
    await tick();
    stepHeading?.focus();
  }

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
        'Original attached. Unsaved input is kept in Character details. No version or job was created.';
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
    step = 0;
    imageFile = null;
    if (fileInput) fileInput.value = '';
    previewFailed = false;
    frozenArtworkFailed = false;
    frozenArtworkLoading = false;
    selectedVersionId = '';
    selectedAnimationName = '';
    previewFrame = 0;
    name = character?.name ?? '';
    description = character?.description ?? '';
    bodyType = character
      ? characterMetadataSchema.shape.bodyType.parse(character.bodyType)
      : 'humanoid';
    fightingStyle = character?.fightingStyle ?? 'unselected';
    specialPower = character?.specialPower ?? 'none';
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
      const metadata = {
        name,
        description,
        bodyType,
        ...(!selected || fightingStyle !== selected.fightingStyle
          ? { fightingStyle }
          : {}),
        ...(!selected || specialPower !== selected.specialPower
          ? { specialPower }
          : {}),
      };
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
      fightingStyle = result.value.fightingStyle;
      specialPower = result.value.specialPower;
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
      if (failure?.fieldErrors) {
        await tick();
        nameInput
          ?.closest('form')
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      }
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
    Save character details, optionally attach a private original, then inspect
    read-only frozen history. Creative choices are authoring intent only.
    Generation and publication actions are unavailable; no factory jobs are
    running here.
  </p>
  <div class="my-5 flex flex-wrap gap-3">
    <button disabled={busy} onclick={() => requestOpen(null)}
      >New character</button
    >
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
  <div class="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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
                  onclick={() => requestOpen(character)}
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
      <section
        aria-label="Metadata editor"
        aria-busy={busy}
        class="min-w-0 break-words"
      >
        <h2 class="text-xl font-semibold">
          {selected ? 'Edit character' : 'Create character'}
        </h2>
        {#if selected}<p>
            Editing metadata revision {selected.editRevision}
          </p>{/if}
        <p class="my-3" role="status">
          {unsaved
            ? 'Unsaved input — kept while moving between steps.'
            : 'No unsaved input.'}
        </p>
        <nav aria-label="Character steps" class="my-4 flex flex-wrap gap-2">
          {#each steps as label, index (label)}
            <button
              disabled={busy || confirming || (!selected && index > 0)}
              aria-current={step === index ? 'step' : undefined}
              onclick={() => goToStep(index)}>{index + 1}. {label}</button
            >
          {/each}
        </nav>
        <h3
          bind:this={stepHeading}
          tabindex="-1"
          class="my-3 text-lg font-semibold"
        >
          Step {step + 1} of {steps.length}: {steps[step]}
        </h3>
        <div hidden={step !== 0}>
          <p class="my-3">
            Tell us about your character. Save these details before attaching
            art. Moving between steps never saves or discards input.
          </p>
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
              <div>
                <label for="fighting-style">Fighting style</label>
                <select
                  id="fighting-style"
                  bind:value={fightingStyle}
                  aria-invalid={!!failure?.fieldErrors?.fightingStyle}
                  aria-describedby={failure?.fieldErrors?.fightingStyle
                    ? 'creative-help error-fightingStyle'
                    : 'creative-help'}
                >
                  {#if !knownStyle}<option value={fightingStyle} disabled
                      >Unsupported stored choice: {fightingStyle}</option
                    >{/if}
                  {#each fightingStyleChoices as choice (choice.value)}<option
                      value={choice.value}>{choice.label}</option
                    >{/each}
                </select>
              </div>
              <div>
                <label for="special-power">Special power</label>
                <select
                  id="special-power"
                  bind:value={specialPower}
                  aria-invalid={!!failure?.fieldErrors?.specialPower}
                  aria-describedby={failure?.fieldErrors?.specialPower
                    ? 'creative-help error-specialPower'
                    : 'creative-help'}
                >
                  {#if !knownPower}<option value={specialPower} disabled
                      >Unsupported stored choice: {specialPower}</option
                    >{/if}
                  {#each specialPowerChoices as choice (choice.value)}<option
                      value={choice.value}>{choice.label}</option
                    >{/each}
                </select>
              </div>
              <p id="creative-help">
                Authoring intent only; saving does not change gameplay or
                generate art. The runtime supports light melee only. No special
                powers are implemented; None is the only supported power.
                Unsupported stored choices are kept unless you deliberately
                replace them.
              </p>
              <button type="submit" disabled={blocked}
                >{busy ? 'Saving…' : 'Save metadata'}</button
              >
            </fieldset>
          </form>
          {#if !selected}<p class="my-3">
              Save metadata to create the identity and unlock the optional
              original and read-only review steps.
            </p>{/if}
        </div>
        {#if selected}
          <div hidden={step !== 2}>
            <section aria-label="Authoring summary" class="my-4 space-y-2">
              <h3 class="text-lg font-semibold">
                Current authoring input (not a frozen version)
              </h3>
              <p>{name} · {bodyType}</p>
              <p class="whitespace-pre-wrap">{description}</p>
              <p>
                Fighting style: {fightingStyle} · Special power: {specialPower}
              </p>
              <p>
                {unsaved
                  ? 'Includes unsaved input; return to Character details to save.'
                  : 'Matches the loaded authoring identity.'} This does not generate,
                approve or publish content.
              </p>
            </section>
            <section aria-label="Generation and jobs" class="my-6 space-y-3">
              <h3 class="text-lg font-semibold">Generation and jobs</h3>
              <p role="status">
                Unavailable until Phase 6: no generation job is queued or
                running, and retry/cancel controls are not available.
              </p>
            </section>
            <section aria-label="Frozen version history" class="my-6 space-y-3">
              <h3 class="text-lg font-semibold">Frozen versions (read only)</h3>
              <p>
                These immutable review snapshots are separate from your mutable
                authoring fields above. Approval and publication are distinct;
                only a ready release establishes published visibility.
              </p>
              {#if selected}
                {@const history = versionHistory(selected.id)}
                {#if history.loading}<p role="status">
                    Loading frozen versions…
                  </p>
                {:else if history.error}<p role="alert">
                    Version history unavailable. Reload the editor to retry.
                  </p>
                {:else if history.current?.ok}
                  {#if history.current.value.length === 0}<p>
                      No frozen versions exist for this character.
                    </p>
                  {:else}
                    <label for="frozen-version"
                      >Choose a frozen version to inspect</label
                    >
                    <select
                      id="frozen-version"
                      aria-label="Frozen version"
                      onchange={(event) => {
                        selectedVersionId = event.currentTarget.value;
                        selectedAnimationName = '';
                        frozenArtworkFailed = false;
                        frozenArtworkLoading = Boolean(
                          event.currentTarget.value,
                        );
                        previewFrame = 0;
                      }}
                    >
                      <option value="">Choose version</option>
                      {#each history.current.value as item (item.id)}<option
                          value={item.id}
                          >v{item.version} · {item.status}</option
                        >{/each}
                    </select>
                    {#if selectedVersionId}
                      {@const frozen = history.current.value.find(
                        (item) => item.id === selectedVersionId,
                      )}
                      {#if frozen}
                        <article
                          aria-label="Selected frozen version"
                          class="border p-3"
                        >
                          <h4>Frozen version {frozen.version}</h4>
                          <p>Version ID: <code>{frozen.id}</code></p>
                          <p>
                            Manifest SHA-256: <code class="break-all"
                              >{frozen.manifestSha256 ?? 'Unavailable'}</code
                            >
                          </p>
                          {#if frozen.snapshotAvailable && frozen.snapshot}
                            {@const metadata = frozen.snapshot as {
                              name?: string;
                              description?: string;
                              bodyType?: string;
                            }}
                            <h5>
                              {metadata.name ?? 'Unnamed frozen snapshot'}
                            </h5>
                            <p>{metadata.description ?? ''}</p>
                            <p>
                              Body type: {metadata.bodyType ?? 'Unavailable'}
                            </p>
                          {:else}<p role="alert">
                              Frozen snapshot unavailable or corrupt; no mutable
                              authoring values substituted.
                            </p>{/if}
                          <h5>Review and approval (read only)</h5>
                          {#if frozen.decisions.length === 0}<p>
                              No approval decision recorded; this snapshot has
                              no recorded approval.
                            </p>{:else}
                            {@const latestDecision = frozen.decisions[0]!}
                            <p>
                              Latest decision: {latestDecision.decision} ·
                              {latestDecision.actorLabel} · hash-bound to
                              {latestDecision.manifestSha256}.
                            </p>
                            {#if latestDecision.note}<p>
                                Note: {latestDecision.note}
                              </p>{/if}
                            <h6>Append-only decision history (newest first)</h6>
                            <ul>
                              {#each frozen.decisions as decision (decision.decisionOrder)}<li
                                >
                                  {decision.decision} · {decision.actorLabel} · {new Date(
                                    decision.createdAt,
                                  ).toLocaleString()} · hash {decision.manifestSha256}
                                  {decision.note ? ` · ${decision.note}` : ''}
                                </li>{/each}
                            </ul>
                          {/if}
                          <h5>Published visibility</h5>
                          {#if frozen.publications.length === 0}<p>
                              Not present in any ready published release.
                            </p>{:else}<ul>
                              {#each frozen.publications as publication (publication.releaseId)}<li
                                >
                                  Ready release {publication.releaseId} · {publication.publishedAt
                                    ? new Date(
                                        publication.publishedAt,
                                      ).toLocaleString()
                                    : 'publication time unavailable'}
                                </li>{/each}
                            </ul>{/if}
                          {#if frozen.snapshotAvailable && frozen.snapshot && frozen.publications.length > 0}
                            {@const parsedManifest =
                              characterManifestSchema.safeParse(
                                frozen.snapshot,
                              )}
                            {#if parsedManifest.success}
                              {@const manifest = parsedManifest.data}
                              {@const animationNames = Object.keys(
                                manifest.animations,
                              ).sort()}
                              {@const animationName = animationNames.includes(
                                selectedAnimationName,
                              )
                                ? selectedAnimationName
                                : animationNames[0]}
                              {@const animation = animationName
                                ? manifest.animations[animationName]
                                : undefined}
                              {@const assetHash = animation
                                ? manifest.assets[animation.assetId]?.sha256
                                : undefined}
                              <div
                                class="my-5 grid grid-cols-1 gap-4 md:grid-cols-2"
                                aria-label="Artwork comparison"
                              >
                                <section
                                  aria-label="Current original comparison"
                                  class="min-w-0 border p-3"
                                >
                                  <h5>Current mutable authoring original</h5>
                                  <p>
                                    This is the currently attached original, not
                                    necessarily the source of frozen version {frozen.version}.
                                  </p>
                                  {#if selected.originalAssetId}
                                    <img
                                      class="max-h-72 w-full object-contain"
                                      src={resolve(
                                        '/api/characters/[id]/originals/[assetId]/[kind]',
                                        {
                                          id: selected.id,
                                          assetId: selected.originalAssetId,
                                          kind: 'preview',
                                        },
                                      )}
                                      alt="Current mutable authoring original; may not be the source of this frozen version"
                                      onerror={() => {
                                        previewFailed = true;
                                      }}
                                    />
                                    {#if previewFailed}<p role="alert">
                                        Current original preview unavailable. No
                                        other image is substituted.
                                      </p>{/if}
                                  {:else}<p>
                                      No current original is attached.
                                    </p>{/if}
                                </section>
                                <section
                                  aria-label="Frozen animation panel"
                                  class="min-w-0 border p-3"
                                >
                                  <h5>
                                    Frozen version {frozen.version} animation
                                  </h5>
                                  {#if animationName && animation && assetHash}
                                    <label for="frozen-animation"
                                      >Animation</label
                                    >
                                    <select
                                      id="frozen-animation"
                                      aria-label="Frozen animation"
                                      value={animationName}
                                      onchange={(event) => {
                                        selectedAnimationName =
                                          event.currentTarget.value;
                                        previewFrame = 0;
                                        frozenArtworkFailed = false;
                                        frozenArtworkLoading = true;
                                      }}
                                    >
                                      {#each animationNames as name}<option
                                          value={name}>{name}</option
                                        >{/each}
                                    </select>
                                    {#if frozenArtworkFailed}<p role="alert">
                                        Frozen animation unavailable. The
                                        selected asset could not be loaded; no
                                        other version or image is substituted.
                                      </p>
                                    {:else}
                                      {@const rows = Math.ceil(
                                        animation.frameCount /
                                          animation.columns,
                                      )}
                                      {@const artworkUrl = resolve(
                                        '/api/content/characters/[id]/versions/[version]/assets/[hash].png',
                                        {
                                          id: manifest.characterId,
                                          version: String(
                                            manifest.characterVersion,
                                          ),
                                          hash: assetHash,
                                        },
                                      )}
                                      <img
                                        class="sr-only"
                                        src={artworkUrl}
                                        alt=""
                                        onload={() => {
                                          frozenArtworkLoading = false;
                                        }}
                                        onerror={() => {
                                          frozenArtworkLoading = false;
                                          frozenArtworkFailed = true;
                                        }}
                                      />
                                      {#if frozenArtworkLoading}<p
                                          role="status"
                                        >
                                          Loading frozen animation artwork…
                                        </p>{/if}
                                      <div
                                        class="my-3 flex min-h-64 items-center justify-center overflow-hidden"
                                        role="img"
                                        aria-label={`Frame ${previewFrame + 1} of ${animation.frameCount} for ${animationName}`}
                                        style={`width:100%;aspect-ratio:1;max-height:18rem;background-image:url("${artworkUrl}");background-size:${animation.columns * 100}% ${rows * 100}%;background-position:${animation.columns > 1 ? ((previewFrame % animation.columns) / (animation.columns - 1)) * 100 : 0}% ${rows > 1 ? (Math.floor(previewFrame / animation.columns) / (rows - 1)) * 100 : 0}%;background-repeat:no-repeat`}
                                      ></div>
                                      <p>
                                        Frame {previewFrame + 1} / {animation.frameCount}
                                        · {animation.fps} frames/s · {animation.loop
                                          ? 'loops'
                                          : 'plays once'}{animation.loop
                                          ? ''
                                          : ' · does not loop'}
                                      </p>
                                      <div class="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onclick={() => {
                                            previewFrame =
                                              (previewFrame +
                                                animation.frameCount -
                                                1) %
                                              animation.frameCount;
                                          }}>Previous frame</button
                                        ><button
                                          type="button"
                                          onclick={() => {
                                            previewFrame =
                                              (previewFrame + 1) %
                                              animation.frameCount;
                                          }}>Next frame</button
                                        ><button
                                          type="button"
                                          onclick={() => {
                                            previewFrame = 0;
                                          }}>Restart preview</button
                                        >
                                      </div>
                                      {#if reducedMotion}<p role="status">
                                          Reduced motion is preferred; automatic
                                          playback is paused. Use frame controls
                                          to inspect.
                                        </p>{/if}
                                    {/if}
                                  {:else}<p role="alert">
                                      Frozen animation data is unavailable in
                                      this manifest.
                                    </p>{/if}
                                </section>
                              </div>
                            {:else}<p role="alert">
                                Frozen animation data is unavailable or invalid.
                                No mutable values are substituted.
                              </p>{/if}
                          {:else}
                            <p>
                              Frozen artwork preview unavailable: unpublished
                              versions are not delivered by the
                              published-content boundary. No storage path,
                              original, or unpublished asset is exposed.
                            </p>
                          {/if}
                          <p>
                            The current original is mutable authoring art—not
                            necessarily the source of this selected frozen
                            version. Frozen animation images are shown only
                            through the existing ready-release content route.
                          </p>
                        </article>
                      {/if}
                    {/if}
                  {/if}
                {:else if history.current}<p role="alert">
                    {history.current.error.message}
                  </p>{/if}
              {/if}
            </section>
          </div>
          <div hidden={step !== 1}>
            <section aria-label="Original art" class="my-6 space-y-3">
              <h3 class="text-lg font-semibold">Private original art</h3>
              <p>
                Still JPEG, PNG or WebP; up to 10 MiB and 20 megapixels.
                Attaching replaces the selected original, retaining earlier art
                immutably. Unsaved metadata is not submitted.
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
          </div>
          <div class="my-6 flex flex-wrap gap-3" aria-label="Step navigation">
            <button
              disabled={busy || confirming || step === 0}
              onclick={() => goToStep(step - 1)}>Previous step</button
            >
            <button
              disabled={busy || confirming || step === steps.length - 1}
              onclick={() => goToStep(step + 1)}>Next step</button
            >
          </div>
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
