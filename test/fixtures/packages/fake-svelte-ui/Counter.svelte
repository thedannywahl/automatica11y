<script>
  import { counter } from "./counter.svelte.js";
</script>

<button type="button" onclick={() => counter.count++}>Count is {counter.count}</button>
