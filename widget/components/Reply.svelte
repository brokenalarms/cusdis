<script>
  import { getContext } from 'svelte'
  import { t } from '../i18n'
  export let parentId

  // form data
  let content = ''
  let nickname = ''
  let email = ''
  let required_field = '' // honeypot

  // anti-spam traps
  const renderedAt = Date.now()
  let submittedAt = 0
  const honeypotName = `required_${Math.random().toString(36).slice(2, 10)}`
  let honeypotValue = ''
  let trapChecked = false // must remain false; bots often toggle all controls

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

    if (!email) {
      alert(t('email_is_required'))
      return
    }

    submittedAt = Date.now()

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
        required_field, // legacy honeypot name (kept for back-compat)
        honey: { n: honeypotName, v: honeypotValue },
        trapChecked,
        renderedAt,
        submittedAt,
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

<form class="space-y-6" on:submit|preventDefault={addComment}>
  <div>
    <label for="nickname" class="block text-sm font-medium text-gray-700 prose dark:text-white dark:prose-invert">{t('nickname')}</label>
    <div class="mt-1">
      <input
        id="nickname"
        name="nickname"
        type="text"
        autocomplete="name"
        required
        bind:value={nickname}
        class="block w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
        title={t('nickname')}
      />
    </div>
  </div>

  <div>
    <label for="email" class="block text-sm font-medium text-gray-700 dark:text-white">{t('email')}</label>
    <div class="mt-1">
      <input
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        required
        bind:value={email}
        class="block w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
        title={t('email')}
      />
    </div>
  </div>

  <div>
    <label for="reply_content" class="block text-sm font-medium text-gray-700 dark:text-white">{t('reply_placeholder')}</label>
    <div class="mt-1">
      <textarea
        id="reply_content"
        name="reply_content"
        rows="4"
        required
        bind:value={content}
        class="block w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
        title={t('reply_placeholder')}
      ></textarea>
    </div>
  </div>

  <!-- Visually-hidden anti-spam fields -->
  <div
    style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;"
    inert
  >
    <!-- legacy fixed-name honeypot -->
    <label for="required_field">Required field</label>
    <input
      id="required_field"
      name="required_field"
      type="text"
      tabindex="-1"
      autocomplete="off"
      bind:value={required_field}
    />

    <!-- rotating-name honeypot -->
    <label for={honeypotName}>Required field</label>
    <input
      name={honeypotName}
      type="text"
      tabindex="-1"
      autocomplete="off"
      bind:value={honeypotValue}
    />

    <!-- checkbox trap: must remain unchecked -->
    <label for="agree_all">Agree to all</label>
    <input
      id="agree_all"
      name="agree_all"
      type="checkbox"
      tabindex="-1"
      bind:checked={trapChecked}
    />

    <!-- time trap is sent via renderedAt/submittedAt in payload -->
  </div>

  <div>
    <button
      type="submit"
      disabled={loading}
      class="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
      cusdis-disabled={loading}
    >
      {#if loading}
        <svg
          class="mr-2 h-5 w-5 animate-spin text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
          role="status"
          aria-label="loading"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          ></path>
        </svg>
        {t('sending')}
      {:else}
        {t('post_comment')}
      {/if}
    </button>
  </div>
</form>
