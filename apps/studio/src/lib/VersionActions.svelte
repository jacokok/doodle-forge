<script lang="ts">
  import { tick } from 'svelte';
  import { decideVersion, publishVersion } from './characters.remote.js';
  let {
    characterId,
    versionId,
    hash,
    decisionOrder,
    latestDecision,
    busy = $bindable(false),
    refresh,
  }: {
    characterId: string;
    versionId: string;
    hash: string;
    decisionOrder: number;
    latestDecision: string | undefined;
    busy?: boolean;
    refresh: () => Promise<void>;
  } = $props();
  type Action = 'approved' | 'rejected' | 'revoked' | 'publish';
  let dialog: HTMLDialogElement;
  let cancelButton = $state<HTMLButtonElement>();
  let refreshButton: HTMLButtonElement;
  let errorSummary = $state<HTMLParagraphElement>();
  let action = $state<Action | null>(null);
  let failed = $state('');
  let notice = $state('');
  let needsRefresh = $state(false);
  let trigger: HTMLButtonElement;
  let pendingInput = $state({
    characterId: '',
    versionId: '',
    expectedManifestSha256: '',
    expectedDecisionOrder: 0,
  });
  const labels = {
    approved: 'Approve version',
    rejected: 'Reject version',
    revoked: 'Revoke approval',
    publish: 'Publish version',
  };

  async function prepare(next: Action, button: HTMLButtonElement) {
    trigger = button;
    pendingInput = {
      characterId,
      versionId,
      expectedManifestSha256: hash,
      expectedDecisionOrder: decisionOrder,
    };
    action = next;
    dialog.showModal();
    await tick();
    cancelButton?.focus();
  }
  async function cancel() {
    if (busy) return;
    dialog.close();
    action = null;
    await tick();
    trigger?.focus();
  }
  async function reloadReview() {
    busy = true;
    try {
      await refresh();
      failed = '';
      needsRefresh = false;
      notice = 'Review refreshed. Check the latest decision before acting.';
    } catch {
      failed = 'Review refresh failed. Your authoring input is kept.';
    } finally {
      busy = false;
    }
  }
  async function confirm() {
    if (!action || busy) return;
    busy = true;
    failed = '';
    notice = '';
    const selectedAction = action;
    try {
      const result =
        selectedAction === 'publish'
          ? await publishVersion(pendingInput)
          : await decideVersion({ ...pendingInput, decision: selectedAction });
      if (!result.ok) {
        failed = `${result.error.message} Reference: ${result.error.requestId}`;
        needsRefresh = true;
      } else {
        notice =
          selectedAction === 'publish'
            ? 'Published. A ready release now makes this version visible to the game.'
            : `Decision recorded: ${selectedAction}. Published releases are unchanged.`;
        await refresh();
      }
    } catch {
      failed =
        'Could not confirm the result. Refresh review before retrying; the action may have completed. Your authoring input is kept.';
      needsRefresh = true;
    } finally {
      busy = false;
      dialog.close();
      action = null;
      await tick();
      if (failed) errorSummary?.focus();
      else refreshButton?.focus();
    }
  }
</script>

<section aria-label="Frozen version actions" class="my-4 space-y-3">
  <p>
    Actions apply only to this frozen hash, never to unsaved authoring input.
    Rejecting or revoking does not remove existing published releases.
  </p>
  <p role="status">{busy ? 'Applying frozen-version action…' : notice}</p>
  {#if failed}<p bind:this={errorSummary} role="alert" tabindex="-1">
      {failed}
    </p>{/if}
  <div class="flex flex-wrap gap-2">
    {#each ['approved', 'rejected', 'revoked', 'publish'] as choice (choice)}
      {@const next = choice as Action}
      <button
        disabled={busy ||
          needsRefresh ||
          (next === 'publish' && latestDecision !== 'approved')}
        onclick={(event) => prepare(next, event.currentTarget)}
        >{labels[next]}</button
      >
    {/each}
    <button bind:this={refreshButton} disabled={busy} onclick={reloadReview}
      >Refresh review</button
    >
  </div>
  {#if latestDecision !== 'approved'}<p>
      Publication requires a matching latest approval.
    </p>{/if}
  <dialog
    bind:this={dialog}
    aria-label="Confirm frozen-version action"
    class="m-auto max-w-lg border-2 p-6"
    oncancel={(event) => {
      event.preventDefault();
      void cancel();
    }}
  >
    {#if action}
      <h2 class="text-xl font-semibold">{labels[action]}?</h2>
      <p>Version ID: {pendingInput.versionId}</p>
      <p class="break-all">
        Manifest SHA-256: {pendingInput.expectedManifestSha256}
      </p>
      <p>
        {action === 'publish'
          ? 'This explicitly activates a release visible to the game. No generation job is started.'
          : 'This records an append-only decision. It does not publish or remove game content.'}
      </p>
      <div class="my-4 flex flex-wrap gap-2">
        <button bind:this={cancelButton} disabled={busy} onclick={cancel}
          >Cancel action</button
        >
        <button disabled={busy} onclick={confirm}
          >Confirm {labels[action].toLowerCase()}</button
        >
      </div>
    {/if}
  </dialog>
</section>
