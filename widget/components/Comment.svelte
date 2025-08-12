<script>
  import { getContext } from 'svelte'
  import { t } from '../i18n'

  import Reply from './Reply.svelte'
  export let comment
  export let showReplyForm = false
  export let isChild = false

  const { showIndicator } = getContext('attrs')

</script>

<article class="px-6 py-4 text-base bg-white rounded-lg mb-4 dark:bg-gray-900 {isChild ? 'ml-6 lg:ml-12' : ''}">
  <footer class="flex justify-between items-center mb-2">
    <div class="flex items-center">
      <p class="inline-flex items-center mr-3 text-sm text-gray-900 dark:text-white font-semibold">
        {comment.moderator?.displayName ?? comment.by_nickname}
        {#if comment.moderator}
          <span class="ml-2 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded">{t('mod_badge')}</span>
        {/if}
      </p>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        <time pubdate datetime={comment.parsedCreatedAt}>{comment.parsedCreatedAt}</time>
      </p>
    </div>
  </footer>

  <p class="text-gray-500 dark:text-gray-400">{@html comment.parsedContent}</p>

  <div class="flex items-center mt-4 space-x-4">
    <button type="button" class="flex items-center text-sm text-gray-500 hover:underline dark:text-gray-400 font-medium"
      on:click={() => showReplyForm = !showReplyForm}>
      <svg class="mr-1.5 w-3.5 h-3.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 18">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M5 5h5M5 8h2m6-3h2m-5 3h6m2-7H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3v5l5-5h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" />
      </svg>
      {t('reply_btn')}
    </button>
  </div>

  {#if showReplyForm}
    <div class="mt-4 pl-4 border-l-2 border-gray-200">
      <Reply
        parentId={comment.id}
        onSuccess={() => {
          showReplyForm = false
        }}
      />
    </div>
  {/if}
  {#if comment.replies.data.length > 0}
    {#each comment.replies.data as child (child.id)}
      <svelte:self isChild={true} comment={child} />
    {/each}
  {/if}

</article>
