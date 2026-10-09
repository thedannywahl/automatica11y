<script>
  // Passes every other prop to the native button, the way most Svelte libraries do.
  let { children, ...rest } = $props();
</script>

<button type="button" class="ui-button" {...rest}>{@render children?.()}</button>

<style>
  .ui-button { min-width: 44px; min-height: 44px; }
</style>
