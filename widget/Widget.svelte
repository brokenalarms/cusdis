<script>
  import './theme.css'
  import { onMount, setContext } from 'svelte'
  import axios from 'redaxios'
  import Comment from './components/Comment.svelte'
  import Reply from './components/Reply.svelte'
  import { t } from './i18n'

  export let attrs = {}
  export let commentsResult = { data: [], pageCount: 0 }

  let page = 1

  let loadingComments = true

  let message = ''

  let error

  let theme = attrs.theme || 'light'

  const api = axios.create({
    baseURL: attrs.host,
  })

  function setMessage(msg) {
    message = msg
  }

  onMount(() => {
    function onMessage(e) {
      try {
        const msg = JSON.parse(e.data)
        if (msg.from === 'cusdis') {
          switch (msg.event) {
            case 'setTheme':
              {
                theme = msg.data
              }
              break
          }
        }
      } catch (e) {}
    }
    window.addEventListener('message', onMessage)

    return () => {
      window.removeEventListener('message', onMessage)
    }
  })

  function addCommentOptimistically(comment, parentId = null) {
    if (parentId) {
      // Add as reply to existing comment
      const findAndAddReply = (comments) => {
        for (let c of comments) {
          if (c.id === parentId) {
            if (!c.replies) c.replies = { data: [] }
            c.replies.data = [comment, ...c.replies.data]
            return true
          }
          // Recursively search replies
          if (c.replies?.data?.length > 0) {
            if (findAndAddReply(c.replies.data)) {
              return true
            }
          }
        }
        return false
      }
      findAndAddReply(commentsResult.data)
    } else {
      // Add as top-level comment
      commentsResult.data = [comment, ...commentsResult.data]
    }

    // Trigger reactivity
    commentsResult = { ...commentsResult }
  }

  setContext('api', api)
  setContext('attrs', attrs)
  setContext('refresh', getComments)
  setContext('addCommentOptimistically', addCommentOptimistically)
  setContext('setMessage', setMessage)

  async function getComments(p = 1) {
    loadingComments = true
    try {
      const res = await api.get(`/api/open/comments`, {
        headers: {
          'x-timezone-offset': -new Date().getTimezoneOffset(),
        },
        params: {
          page: p,
          appId: attrs.appId,
          pageId: attrs.pageId,
        },
      })
      commentsResult = res.data.data
    } catch (e) {
      error = e
      console.log(e)
    } finally {
      loadingComments = false
    }
  }

  function onClickPage(p) {
    page = p
    getComments(p)
  }

  onMount(() => {
    getComments()
  })
</script>

{#if !error}
  <div class:dark={theme === 'dark'}>
    {#if message}
      <div
        class="my-3 mx-auto text-center text-sm bg-gray-200 py-3 px-4 font-bold dark:bg-transparent dark:border dark:border-gray-100 dark:text-white rounded-xl transition-transform duration-300 ease-in-out sm:hover:scale-104"
      >
        {message}
      </div>
    {/if}

    <Reply />

    <div class="my-8" />

    <div class="mt-4 px-1">
      {#if loadingComments}
        <div
          class="w-full py-3 justify-center px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-xl border border-transparent text-sm bg-gray-200 p-2 px-4 font-bold dark:bg-transparent dark:border dark:border-gray-100 dark:text-white focus:outline-hidden focus:bg-blue-700 focus:outline-hidden focus:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          <svg
            class="mr-2 h-5 w-5 animate-spin dark:text-white text-black"
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
          Loading comments...
        </div>
      {:else if commentsResult && commentsResult.data}
        {#each commentsResult.data as comment (comment.id)}
          <Comment {comment} firstFloor={true} />
        {/each}
        {#if commentsResult.pageCount > 1}
          <div>
            {#each Array(commentsResult.pageCount) as _, index}
              <button
                class="px-2 py-1 text-sm mr-2 dark:text-gray-200"
                class:underline={page === index + 1}
                on:click={(_) => onClickPage(index + 1)}>{index + 1}</button
              >
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <div class="my-8" />

    <div class="text-center text-gray-500 dark:text-gray-100 text-xs">
      <a class="underline" href="https://cusdis.com">{t('powered_by')}</a>
    </div>
  </div>
{/if}
