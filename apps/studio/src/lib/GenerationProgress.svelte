<script lang="ts">
  import { onMount } from 'svelte';
  import {
    cancelGeneration,
    generationProgress,
    retryGeneration,
  } from './characters.remote.js';

  let {
    characterId,
    active,
    onReviewReady,
  }: {
    characterId: string;
    active: boolean;
    onReviewReady: (id: string) => Promise<void>;
  } = $props();
  const jobs = $derived(active ? generationProgress(characterId) : null);
  let hidden = $state(false);
  let inFlight = $state(false);
  let networkError = $state(false);
  let cancelling = $state('');
  let cancelMessage = $state('');
  let cancelError = $state('');
  let retrying = $state('');
  let retryNeedsRefresh = $state(false);
  let retryError = $state('');
  let retryMessage = $state('');
  async function retryJob(
    jobId: string,
    version: number,
    candidate: { stepId: string; attempts: number },
  ) {
    if (
      retrying ||
      cancelling ||
      retryNeedsRefresh ||
      inFlight ||
      jobs?.loading ||
      !window.confirm(
        `Retry generation v${version}? This resumes unfinished work using remaining attempt budgets. Completed checkpoints and the original are retained.`,
      )
    )
      return;
    retrying = jobId;
    retryError = '';
    retryMessage = '';
    try {
      const result = await retryGeneration({
        characterId,
        jobId,
        stepId: candidate.stepId,
        attempts: candidate.attempts,
      });
      if (result.ok) retryMessage = `Generation v${version} was requeued.`;
      else
        retryError = `${result.error.message} Reference: ${result.error.requestId} Refresh progress before retrying.`;
    } catch {
      retryError =
        'Retry result is uncertain. Refresh progress before taking further action.';
    } finally {
      retrying = '';
      retryNeedsRefresh = true;
      // An authoritative refresh is mandatory before another retry; periodic polling does not clear this guard.
    }
  }
  async function cancelJob(jobId: string, version: number) {
    if (
      cancelling ||
      !window.confirm(
        `Cancel generation v${version}? Completed work and the original are retained; this cannot be undone.`,
      )
    )
      return;
    cancelling = jobId;
    cancelMessage = '';
    cancelError = '';
    try {
      const result = await cancelGeneration({ characterId, jobId });
      if (result.ok)
        cancelMessage = `Cancellation recorded for generation v${version}.`;
      else
        cancelError = `${result.error.message} Reference: ${result.error.requestId}`;
    } catch {
      cancelError =
        'Cancellation result is uncertain. Refresh progress; retrying cancellation is safe.';
    } finally {
      cancelling = '';
      await refresh(true);
    }
  }
  const statusLabels = {
    queued: 'Queued',
    running: 'Running',
    waiting_approval: 'Waiting for approval (not published)',
    waiting_publish: 'Waiting for explicit publication',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  onMount(() => {
    const update = () => {
      hidden = document.hidden;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  });
  async function refresh(manual = false) {
    const query = jobs;
    const id = characterId;
    if (!query || hidden || inFlight || query.loading) return;
    inFlight = true;
    const previous = query.current?.ok
      ? new Set(query.current.value.map((job) => job.frozenVersionId))
      : new Set();
    try {
      await query.refresh();
      networkError = false;
      if (manual && query.current?.ok) retryNeedsRefresh = false;
      if (
        query.current?.ok &&
        (manual ||
          query.current.value.some(
            (job) => job.frozenVersionId && !previous.has(job.frozenVersionId),
          ))
      )
        await onReviewReady(id).catch(() => {}); // History renders its own errors without replacing authoring input.
    } catch {
      networkError = true;
    } finally {
      inFlight = false;
    }
  }
  $effect(() => {
    if (!active || hidden || !jobs) return;
    let stopped = false;
    let wait = 1000;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (stopped) return;
      wait = Math.min(wait * 2, 5000);
      timer = setTimeout(() => {
        void poll();
      }, wait);
    };
    timer = setTimeout(() => {
      void poll();
    }, wait);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  });
</script>

<section
  aria-label="Generation and jobs"
  class="my-6 space-y-3"
  aria-busy={jobs?.loading || inFlight}
>
  <h3 class="text-lg font-semibold">Generation and jobs</h3>
  <p>
    This panel reads persisted job progress. Queued or running jobs can be
    cancelled; eligible failed jobs can be retried within their remaining
    attempt budgets. Completion does not approve or publish.
  </p>
  <button
    type="button"
    disabled={!jobs || jobs.loading || inFlight}
    onclick={() => refresh(true)}>Refresh generation progress</button
  >
  {#if retryError}<p role="alert">{retryError}</p>{/if}
  {#if retryMessage}<p role="status">{retryMessage}</p>{/if}
  {#if retryNeedsRefresh}<p>
      Refresh generation progress before another retry.
    </p>{/if}
  {#if cancelError}<p role="alert">{cancelError}</p>{/if}
  {#if cancelMessage}<p role="status">{cancelMessage}</p>{/if}
  {#if jobs?.loading && !jobs.current}<p role="status">
      Loading generation progress…
    </p>{/if}
  {#if networkError || jobs?.error}<p role="alert">
      Generation progress unavailable. Refresh to retry; no authoring input was
      changed.
    </p>
  {:else if jobs?.current}
    {#if !jobs.current.ok}<p role="alert">
        {jobs.current.error.message} Reference: {jobs.current.error.requestId}
      </p>
    {:else if jobs.current.value.length === 0}<p>
        No mock generation jobs found for this character.
      </p>
    {:else}
      <p>
        Most recent 10 mock generation jobs. Automatic refresh pauses outside
        this step or while the page is hidden.
      </p>
      <ul class="space-y-4">
        {#each jobs.current.value as job (job.id)}
          <li>
            <article
              aria-label={`Generation job v${job.characterVersion}`}
              class="rounded border p-3"
            >
              <h4 class="font-semibold">Generation v{job.characterVersion}</h4>
              <p>Job ID: <code class="break-all">{job.id}</code></p>
              <p role="status">
                {statusLabels[job.status]} · {job.completed} / {job.total} stages
                complete
              </p>
              <progress
                aria-label={`Completed stages for v${job.characterVersion}`}
                value={job.completed}
                max={job.total}
              ></progress>
              <p>Requested {new Date(job.createdAt).toLocaleString()}</p>
              {#if job.status === 'queued' || job.status === 'running'}
                <button
                  type="button"
                  disabled={!!cancelling}
                  onclick={() => cancelJob(job.id, job.characterVersion)}
                  >{cancelling === job.id
                    ? 'Cancelling…'
                    : `Cancel generation v${job.characterVersion}`}</button
                >
              {/if}
              {#if job.status === 'waiting_approval'}<p>
                  Frozen review version {job.characterVersion} is available in history
                  below. It has not been published.
                </p>{/if}
              {#if job.status === 'failed'}<p>
                  Generation failed. The original and completed checkpoints are
                  retained. {job.retryCandidate
                    ? 'A retry can resume unfinished work within the existing attempt budgets.'
                    : 'Retry is unavailable or the attempt budget is exhausted.'}
                </p>
                {#if job.retryCandidate}
                  <button
                    type="button"
                    disabled={!!retrying ||
                      !!cancelling ||
                      retryNeedsRefresh ||
                      inFlight ||
                      !!jobs?.loading}
                    onclick={() =>
                      retryJob(
                        job.id,
                        job.characterVersion,
                        job.retryCandidate!,
                      )}
                    >{retrying === job.id
                      ? 'Retrying…'
                      : `Retry generation v${job.characterVersion}`}</button
                  >
                {/if}
              {/if}
              <details>
                <summary>Stage details for v{job.characterVersion}</summary>
                <ul>
                  {#each job.steps as step (`${step.stage}:${step.target}`)}
                    <li>
                      {step.stage}{step.target ? ` / ${step.target}` : ''}: {step.status}
                      · attempts {step.attempts} / {step.maxAttempts}
                      {#if step.errorCode}<span> · {step.errorCode}</span>{/if}
                      {#if step.retryAt}<span>
                          · Retry due {new Date(
                            step.retryAt,
                          ).toLocaleString()}</span
                        >{/if}
                    </li>
                  {/each}
                </ul>
              </details>
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
