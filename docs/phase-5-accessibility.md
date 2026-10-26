# Phase 5 accessibility verification

## Implemented, focused coverage

The guided editor uses native labeled inputs/buttons, `aria-current="step"`, hidden inactive panels, and a focused step heading after navigation. Metadata validation focuses the first invalid field, with its server error as an accessible description. Other mutation failures focus a named error summary after controls re-enable; input is retained and stale/uncertain results still require deliberate reload. Upload requirements describe the file input. Successful archive or reload of an externally archived selection moves focus to New character, not the removed editor. Programmatically focused headings/error summaries have a keyboard-visible outline.

Unsaved-input text is not a live region: typing should not announce it repeatedly. Working/success notices remain a status region and failures remain alerts. Animation playback follows reduced-motion preferences, has explicit Pause/Play controls, and stops while the review step or document is hidden. Frame stepping pauses playback; Restart plays from frame one unless reduced motion is preferred. One-shots stop on their final frame and can be replayed. Single-frame previews do not enable Play/Pause. Multi-frame Chromium tests use real published four-frame/two-row PNG content and a controlled clock; visibility events are synthetic, not an OS background-tab or screen-reader test. These behaviors have focused Chromium assertions, not proof of screen-reader announcement quality or accessibility conformance.

## Outstanding manual verification

Run `pnpm dev:studio` after the setup steps. Use synthetic artwork; never record a child's private text/art in issue screenshots.

- Keyboard only: create/save, move through all steps, select/attach original, correct an invalid upload, inspect frozen history if explicitly seeded, cancel archive, then archive. Check logical focus order, visible focus, no hidden-panel tab stops and no lost focus after errors/removal.
- Screen reader: verify landmarks, labels, current step, policy/error descriptions, working/success announcements and failure recovery. Check duplicate announcements from alert focus and whether status messages inside busy regions are announced at completion. Record browser, OS and assistive technology versions.
- Zoom/reflow: test 200%/400% zoom, long names/errors/hashes, portrait and landscape layouts; check clipping, overlap, readable controls and horizontal scrolling.
- Reduced motion/contrast: check animation stops under reduced motion, frame controls still work, and focus/text/status remain distinguishable in high-contrast/forced-colors mode.
- Observe a consenting child with guardian support completing the guided flow. Record confusion and recovery, not identifying information. Automated keyboard completion does not establish child usability.

Record actual observations, failures and fixes in plan 14. None of these manual checks is claimed executed here. Approval/publication mutations remain separately authorized work; generation remains Phase 6. A comprehensive audit and observed child-usability acceptance are still pending.
