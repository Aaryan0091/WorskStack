// WorkStack Tab Tracker - Popup

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot')
  const statusText = document.getElementById('statusText')
  const toggleBtn = document.getElementById('toggleBtn')
  const toggleBtnText = document.getElementById('toggleBtnText')
  const dashboardBtn = document.getElementById('dashboardBtn')
  const addToCollectionBtn = document.getElementById('addToCollectionBtn')
  const addBookmarkBtn = document.getElementById('addBookmarkBtn')
  const currentTabSection = document.getElementById('currentTabSection')
  const currentTabTitleEl = document.getElementById('currentTabTitle')
  const currentTabUrlEl = document.getElementById('currentTabUrl')
  const todayTabs = document.getElementById('todayTabs')
  const todayTime = document.getElementById('todayTime')
  const notification = document.getElementById('notification')
  const notificationIcon = document.getElementById('notificationIcon')
  const notificationText = document.getElementById('notificationText')

  // Modal elements
  const collectionModal = document.getElementById('collectionModal')
  const closeModalBtn = document.getElementById('closeModalBtn')
  const collectionList = document.getElementById('collectionList')

  // Get current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabUrl = activeTab?.url
  const tabTitle = activeTab?.title

  // Get current status from background script with timeout
  let statusResponse = { isTracking: false, isPaused: false, hasSavedSession: false, currentTab: null, sessionTabs: [] }

  try {
    statusResponse = await Promise.race([
      chrome.runtime.sendMessage({ action: 'getStatus' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ])
  } catch (err) {
    // Failed to get status, will use storage fallback
    // Try to load from storage as fallback
    chrome.storage.local.get(['isTracking', 'isPaused'], (result) => {
      statusResponse.isTracking = result.isTracking || false
      statusResponse.isPaused = result.isPaused || false
      updateUI()
    })
  }

  function updateUI() {
    if (statusResponse.isTracking) {
      statusDot.className = 'dot active'
      statusText.textContent = statusResponse.isPaused ? 'Tracking Paused' : 'Tracking Active'
      toggleBtnText.textContent = 'Stop Tracking'
      toggleBtn.classList.add('active')

      if (statusResponse.currentTab) {
        currentTabSection.style.display = 'block'
        currentTabTitleEl.textContent = statusResponse.currentTab.title || 'Untitled'
        currentTabUrlEl.textContent = statusResponse.currentTab.url
      }
    } else {
      statusDot.className = 'dot inactive'
      statusText.textContent = 'Tracking Paused'
      toggleBtnText.textContent = 'Start Tracking'
      toggleBtn.classList.remove('active')
      currentTabSection.style.display = 'none'
    }
  }

  updateUI()

  // Load today's summary from storage
  chrome.storage.local.get(['todayTabs', 'todaySeconds'], (result) => {
    todayTabs.textContent = result.todayTabs || '0'

    const seconds = result.todaySeconds || 0
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      todayTime.textContent = `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      todayTime.textContent = `${minutes}m`
    } else {
      todayTime.textContent = `${seconds}s`
    }
  })

  // Show notification
  function showNotification(message, type = 'success') {
    notification.className = `notification ${type}`
    notificationIcon.textContent = type === 'success' ? '✓' : '✕'
    notificationText.textContent = message
    notification.style.display = 'flex'

    // Hide after 3 seconds
    setTimeout(() => {
      notification.style.display = 'none'
    }, 3000)
  }

  // Close modal
  function closeModal() {
    collectionModal.style.display = 'none'
  }

  closeModalBtn.addEventListener('click', closeModal)

  // Close modal when clicking outside
  collectionModal.addEventListener('click', (e) => {
    if (e.target === collectionModal) {
      closeModal()
    }
  })

  // Toggle tracking button
  toggleBtn.addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'toggleTracking' })

    if (result.success) {
      statusResponse.isTracking = result.isTracking
      updateUI()

      chrome.storage.local.get(['todayTabs'], (storageResult) => {
        const tabs = (storageResult.todayTabs || 0) + (result.isTracking ? 0 : 0)
        chrome.storage.local.set({ todayTabs: tabs })
      })
    }
  })

  // Get API base URL from storage with smart fallback
  function getApiBaseUrl(callback) {
    chrome.storage.local.get(['apiBaseUrl'], (result) => {
      if (result.apiBaseUrl) {
        callback(result.apiBaseUrl)
      } else {
        // If no stored URL, extension may not be properly connected
        // Show error to user
        callback(null)
      }
    })
  }

  // Dashboard button
  dashboardBtn.addEventListener('click', () => {
    getApiBaseUrl((baseUrl) => {
      if (baseUrl) {
        chrome.tabs.create({ url: `${baseUrl}/tracked-activity` })
      } else {
        showNotification('Please visit WorkStack website to connect', 'error')
      }
    })
  })

  // Add to Collection button - show collection selector modal
  addToCollectionBtn.addEventListener('click', async () => {

    if (!tabUrl) {
      showNotification('Cannot add this page', 'error')
      return
    }

    // Check if there's a valid URL (not chrome://, etc.)
    if (tabUrl.startsWith('chrome://') ||
        tabUrl.startsWith('chrome-extension://') ||
        tabUrl.startsWith('edge://') ||
        tabUrl.startsWith('about:')) {
      showNotification('Cannot add special pages', 'error')
      return
    }

    getApiBaseUrl(async (baseUrl) => {
      if (!baseUrl) {
        showNotification('Please connect extension from WorkStack website', 'error')
        collectionModal.style.display = 'none'
        return
      }

      chrome.storage.local.get(['authToken'], async (result) => {
        const token = result.authToken

        if (!token) {
          showNotification('Not logged in. Visit WorkStack to login.', 'error')
          collectionModal.style.display = 'none'
          return
        }

      // Show loading state in modal
      collectionModal.style.display = 'flex'
      collectionList.innerHTML = '<div class="collection-item-loading">Loading collections...</div>'

      try {
        // Fetch collections
        const response = await fetch(`${baseUrl}/api/collections?all=true`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to fetch collections')
        }

        const data = await response.json()
        const collections = data.collections || []

        if (collections.length === 0) {
          collectionList.innerHTML = '<div class="collection-item-empty">No collections found.<br>Create one on the website first!</div>'
          return
        }

        // Render collection items
        collectionList.innerHTML = collections.map(collection => `
          <div class="collection-item" data-id="${collection.id}" data-name="${collection.name}">
            <div class="collection-item-info">
              <div class="collection-item-name">${escapeHtml(collection.name)}</div>
              ${collection.description ? `<div class="collection-item-desc">${escapeHtml(collection.description)}</div>` : ''}
            </div>
            <span class="collection-item-badge ${collection.is_public ? 'public' : 'private'}">
              ${collection.is_public ? 'Public' : 'Private'}
            </span>
          </div>
        `).join('')

        // Add click handlers to collection items
        document.querySelectorAll('.collection-item').forEach(item => {
          item.addEventListener('click', () => {
            const collectionId = item.dataset.id
            const collectionName = item.dataset.name
            addToCollection(collectionId, collectionName)
          })
        })

      } catch (error) {
        collectionList.innerHTML = '<div class="collection-item-empty">Failed to load collections.<br>Try refreshing the page.</div>'
      }
    })
    })
  })

  // Add to selected collection
  async function addToCollection(collectionId, collectionName) {
    getApiBaseUrl(async (baseUrl) => {
      if (!baseUrl) {
        showNotification('Please connect extension from WorkStack website', 'error')
        closeModal()
        return
      }

      chrome.storage.local.get(['authToken'], async (result) => {
        const token = result.authToken

        // Show loading state
        collectionList.innerHTML = '<div class="collection-item-loading">Adding...</div>'

      try {
        let title = tabTitle || tabUrl
        if (!tabTitle) {
          try {
            const urlObj = new URL(tabUrl)
            title = urlObj.hostname
          } catch (e) {
            title = tabUrl
          }
        }

        const bookmarkData = {
          url: tabUrl,
          title: title,
          collection_id: collectionId
        }

        const response = await fetch(`${baseUrl}/api/bookmarks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(bookmarkData)
        })

        const data = await response.json()

        if (response.ok) {
          closeModal()
          showNotification(`Added to "${collectionName}"!`, 'success')
        } else if (response.status === 401) {
          showNotification('Session expired. Click to reconnect.', 'error')
          closeModal()
        } else {
          showNotification(`Error: ${data.error || 'Failed'}`, 'error')
          closeModal()
        }
      } catch (error) {
        showNotification('Failed to connect. Is app running?', 'error')
        closeModal()
      }
    })
    })
  }

  // Helper to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // Add as Bookmark button
  addBookmarkBtn.addEventListener('click', async () => {
    if (!tabUrl) {
      showNotification('Cannot bookmark this page', 'error')
      return
    }

    // Check if there's a valid URL (not chrome://, etc.)
    if (tabUrl.startsWith('chrome://') ||
        tabUrl.startsWith('chrome-extension://') ||
        tabUrl.startsWith('edge://') ||
        tabUrl.startsWith('about:')) {
      showNotification('Cannot bookmark special pages', 'error')
      return
    }

    // Show loading state
    const originalText = addBookmarkBtn.innerHTML
    addBookmarkBtn.innerHTML = 'Adding...'
    addBookmarkBtn.disabled = true

    // Get API base URL from storage
    getApiBaseUrl(async (baseUrl) => {
      if (!baseUrl) {
        showNotification('Please connect extension from WorkStack website', 'error')
        addBookmarkBtn.innerHTML = originalText
        addBookmarkBtn.disabled = false
        return
      }

      chrome.storage.local.get(['authToken'], async (result) => {
        const token = result.authToken

        if (!token) {
          showNotification('Not logged in. Visit WorkStack to login.', 'error')
          addBookmarkBtn.innerHTML = originalText
          addBookmarkBtn.disabled = false
          return
        }

        try {
          // Get the hostname for the title if no title available
          let title = tabTitle || tabUrl
          if (!tabTitle) {
            try {
              const urlObj = new URL(tabUrl)
              title = urlObj.hostname
            } catch (e) {
              title = tabUrl
            }
          }

          const bookmarkData = {
            url: tabUrl,
            title: title,
            description: null,
            notes: null,
            folder_id: null
          }

          // Make API call to create bookmark
          const response = await fetch(`${baseUrl}/api/bookmarks`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(bookmarkData)
        })

        const data = await response.json()

        if (response.ok) {
          showNotification('Bookmark added!', 'success')
        } else if (response.status === 409) {
          showNotification('Already bookmarked', 'error')
        } else if (response.status === 401) {
          showNotification('Session expired. Click to reconnect.', 'error')
        } else {
          showNotification(`Error: ${data.error || 'Failed'}`, 'error')
        }
      } catch (error) {
        showNotification('Failed to connect. Is app running?', 'error')
      } finally {
        addBookmarkBtn.innerHTML = originalText
        addBookmarkBtn.disabled = false
      }
      })
    })
  })
})
