<script>
  import { getContext } from 'svelte'
  import { t } from '../i18n'
  export let parentId

  // form data
  let content = ''
  let nickname = ''
  let email = ''
  let required_field = '' // honeypot
  let acceptNotify = false

  // anti-spam traps
  const renderedAt = Date.now()
  let submittedAt = 0
  const honeypotName = `required_${Math.random().toString(36).slice(2, 10)}`
  let honeypotValue = ''
  let trapChecked = false // must remain false; bots often toggle all controls

  let loading = false
  let showingResult = false
  let resultComment = null
  let resultMessage = ''
  let showApprovalMessage = false

  export let onSuccess

  const api = getContext('api')
  const { appId, pageId, pageUrl, pageTitle } = getContext('attrs')
  const addCommentOptimistically = getContext('addCommentOptimistically')
  
  // Reactive: hide old message when user starts typing in ANY field (for persistent root form)
  $: showMessage = !onSuccess && showApprovalMessage && resultMessage && !content.trim() && !nickname.trim() && !email.trim()
  
  // Reset approval message flag when user starts typing
  $: if (content.trim() || nickname.trim() || email.trim()) {
    showApprovalMessage = false
  }

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
        acceptNotify,
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
      // If the comment was approved, add it optimistically instead of refetching
      const comment = res.data.data
      const isApproved = comment && comment.approved === true

      if (isApproved && typeof addCommentOptimistically === 'function') {
        // Auto-approved: add comment immediately to UI
        addCommentOptimistically(comment, parentId)
        clearForm()
        
        if (onSuccess) {
          // Nested reply: show the approved comment
          resultComment = comment
          showingResult = true
          notifySuccess(true) // Notify parent with approval status
        } else {
          // Root form: clear any previous message
          resultMessage = ''
        }
      } else {
        // Not approved: show "needs approval" message
        const message = t('first_comment_needs_approval')
        clearForm()
        
        if (onSuccess) {
          // Nested reply: show message and let parent decide what to do
          showingResult = true
          resultComment = null
          resultMessage = message
          notifySuccess(false) // Notify parent - successful submission but not approved
        } else {
          // Root form: show message above form
          resultMessage = message
          showApprovalMessage = true
        }
      }
    } finally {
      loading = false
    }
  }

  function clearForm() {
    content = ''
    nickname = ''
    email = ''
  }

  function notifySuccess(approved = false) {
    if (onSuccess) {
      onSuccess(approved)
    }
  }
</script>

{#if showingResult}
  <!-- DEBUG: showingResult={showingResult}, resultComment={!!resultComment}, resultMessage={resultMessage} -->
  <!-- Show result after submission for nested replies -->
  {#if resultComment}
    <!-- Show the approved comment -->
    <article class="pl-6 py-4 text-base bg-white rounded-lg mb-4 dark:bg-black">
      <footer class="flex justify-between items-center mb-2">
        <div class="flex items-center">
          <p class="inline-flex items-center mr-3 text-sm text-gray-900 dark:text-white font-semibold">
            {resultComment?.moderator?.displayName ?? resultComment?.by_nickname}
            {#if resultComment?.moderator}
              <span class="ml-2 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded">{t('mod_badge')}</span>
            {/if}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            <time pubdate datetime={resultComment?.parsedCreatedAt}>{resultComment?.parsedCreatedAt}</time>
          </p>
        </div>
      </footer>
      <p class="text-gray-500 dark:text-gray-400">{@html resultComment?.parsedContent}</p>
    </article>
  {:else}
    <!-- Show submission message -->
    <!-- DEBUG MESSAGE: This should show when resultComment is null -->
    <div
      class="my-3 mx-auto text-center text-sm bg-gray-200 py-3 px-4 font-bold dark:bg-transparent dark:border dark:border-gray-100 dark:text-white rounded-xl transition-transform duration-300 ease-in-out sm:hover:scale-104"
      style="border: 2px solid red;"
    >
      MESSAGE: {resultMessage}
    </div>
  {/if}
{:else}
  <!-- Show persistent message for root form -->
  {#if showMessage}
    <div
      class="my-3 mx-auto text-center text-sm bg-gray-200 py-3 px-4 font-bold dark:bg-transparent dark:border dark:border-gray-100 dark:text-white rounded-xl transition-transform duration-300 ease-in-out sm:hover:scale-104"
    >
      {resultMessage}
    </div>
  {/if}

  <!-- Show the form -->
  <form class="space-y-6" on:submit|preventDefault={addComment}>
  <div class="sm:grid sm:grid-cols-2 gap-6 sm:gap-12">
    <div>
      <label
        for="nickname"
        class="py-2 block text-sm font-medium text-gray-700 prose dark:text-white dark:prose-invert"
        >{t('nickname')}</label
      >
      <div class="mt-1">
        <input
          id="nickname"
          name="nickname"
          type="text"
          autocomplete="name"
          required
          bind:value={nickname}
          class="block w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:text-white dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
          title={t('nickname')}
        />
      </div>
    </div>

    <div>
      <label
        for="email"
        class="py-2 block text-sm font-medium text-gray-700 dark:text-white"
        >{t('email')}</label
      >
      <div class="mt-1">
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          bind:value={email}
          class="block w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:text-white dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
          title={t('email')}
        />
      </div>
    </div>
  </div>
  <div>
    <label
      for="reply_content"
      class="py-2 block text-sm font-medium text-gray-700 dark:text-white"
      >{t('reply_placeholder')}</label
    >
    <div class="mt-1">
      <textarea
        id="reply_content"
        name="reply_content"
        rows="4"
        required
        bind:value={content}
        class="mb-2 block w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 shadow-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:text-white dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
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

  <div class="flex flex-col sm:flex-row gap-4">
    <div
      class="order-1 sm:order-2 justify-center mt-2 flex items-start space-x-2"
    >
      <input
        id="acceptNotify"
        name="acceptNotify"
        type="checkbox"
        bind:checked={acceptNotify}
        class="justify-center mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600"
        aria-describedby="acceptNotify_help"
      />
      <label for="acceptNotify" class="text-sm text-gray-700 dark:text-white">
        {t('receive_email_notification_of_replies') ||
          'Email me when someone replies to my comment'}
      </label>
    </div>
    <button
      type="submit"
      disabled={loading}
      class="my-auto inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
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
{/if}
