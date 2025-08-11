<script>
  import { getContext } from 'svelte'
  import { t } from '../i18n'
  export let parentId

  // form data
  let content = ''
  let nickname = ''
  let email = ''

  let loading = false

  export let onSuccess

  const api = getContext('api')
  const setMessage = getContext('setMessage')
  const { appId, pageId, pageUrl, pageTitle } = getContext('attrs')
  const refresh = getContext('refresh')

  async function addComment() {
    if (!content) {
      alert(t('content_is_required'))
      return
    }

    if (!nickname) {
      alert(t('nickname_is_required'))
      return
    }

    try {
      loading = true
      const res = await api.post('/api/open/comments', {
        appId,
        pageId,
        content,
        nickname,
        email,
        parentId,
        pageUrl,
        pageTitle,
      })
      await refresh()
      teardown()
      setMessage(t('comment_has_been_sent'))
    } finally {
      loading = false
    }
  }

  function teardown() {
    content = ''
    nickname = ''
    email = ''
    onSuccess && onSuccess()
  }
</script>

<div class="grid grid-cols-1 gap-4">
  <div class="grid grid-cols-2 gap-4">
    <div class="px-1">
      <label class="mb-2 block dark:text-gray-200" for="nickname"
        >{t('nickname')}</label
      >
      <input
        name="nickname"
        class="w-full p-2 border border-gray-200 bg-transparent dark:text-gray-100 dark:outline-none rounded-xl"
        type="text"
        title={t('nickname')}
        bind:value={nickname}
      />
    </div>
    <div class="px-1">
      <label class="mb-2 block dark:text-gray-200" for="email"
        >{t('email')}</label
      >
      <input
        name="email"
        class="w-full p-2 border border-gray-200 bg-transparent dark:text-gray-100 dark:outline-none rounded-xl"
        type="email"
        title={t('email')}
        bind:value={email}
      />
    </div>
  </div>

  <div class="px-1">
    <label class="mb-2 block dark:text-gray-200" for="reply_content"
      >{t('reply_placeholder')}</label
    >
    <textarea
      name="reply_content"
      class="w-full p-2 border border-gray-200 h-24 bg-transparent dark:text-gray-100 dark:outline-none rounded-xl"
      title={t('reply_placeholder')}
      bind:value={content}
    />
  </div>

  <div class="px-1">
    <button
      on:click={addComment}
      cusdis-disabled={loading}
      disabled={loading}
      class="text-sm bg-gray-200 p-2 px-4 font-bold dark:bg-transparent dark:border dark:border-gray-100 dark:text-white rounded-xl cursor-pointer transition-transform duration-300 ease-in-out sm:hover:scale-104"
    >
      {#if loading}
        <span
          class="pointer-events-none animate-spin inline-block size-4 border-[3px] border-current border-t-transparent rounded-full"
          role="status"
          aria-label="loading"
        ></span>
        {t('sending')}
      {:else}
        {t('post_comment')}
      {/if}
    </button>
  </div>
</div>
