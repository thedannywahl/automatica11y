<script>
  // A library written for SvelteKit: this module only exists inside a SvelteKit app.
  import { browser } from "$app/environment";
  let { children, ...rest } = $props();
</script>

<button type="button" {...rest}>{#if browser}{@render children?.()}{/if}</button>
