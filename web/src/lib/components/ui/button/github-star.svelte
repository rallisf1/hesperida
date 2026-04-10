<script lang="ts">
    import { onMount } from "svelte";

    let { repo = "rallisf1/hesperida" } = $props();
    let stars: number = $state(0);

    onMount(async () => {
        const res = await fetch(`https://api.github.com/repos/${repo}`);
        const data = await res.json();
        stars = data.stargazers_count;
    })
</script>

<div class="inline-flex rounded-md shadow-sm">
  <button
    class="inline-flex items-center rounded-l-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
  >
    <svg
      class="mr-1.5 h-4 w-4 fill-current text-gray-500"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M8 .25a.75.75 0 0 1 .673.418l1.85 3.75 4.139.602a.75.75 0 0 1 .416 1.279l-2.995 2.92.707 4.123a.75.75 0 0 1-1.088.79L8 12.347l-3.702 1.945a.75.75 0 0 1-1.088-.79l.707-4.123-2.995-2.92a.75.75 0 0 1 .416-1.28l4.139-.601 1.85-3.75A.75.75 0 0 1 8 .25Z"
      />
    </svg>
    Star
  </button>

  <a
    href={`https://github.com/${repo}`} target="_blank"
    class="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
  >
    {stars?.toLocaleString() || '...'}
  </a>
</div>