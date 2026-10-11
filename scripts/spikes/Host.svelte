<script>
  let { onPick } = $props();
  let items = $state(['a']);
  let picker;
  $effect(() => {
    const current = picker;
    current.addEventListener('gyral-output', onPick);
    return () => current.removeEventListener('gyral-output', onPick);
  });
</script>

<platform-picker bind:this={picker} label="Choose" {items} />
<button type="button" onclick={() => { items = ['b']; }}>Change</button>
