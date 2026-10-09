<script>
  let { children, ...rest } = $props();
</script>

<a class="ui-link" {...rest}>{@render children?.()}</a>
