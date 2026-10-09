<script>
  // A single component: it shows when `open` is true and calls `onclose` when its close button is pressed.
  let { open = false, onclose, children } = $props();
</script>

{#if open}
  <div role="dialog" aria-modal="true" aria-label="Dialog">
    {@render children?.()}
    <button type="button" onclick={() => onclose?.()}>Close</button>
  </div>
{/if}
