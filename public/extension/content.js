// WorkStack Extension Content Script
// This script runs on workstack pages to enable communication between the page and extension

(function() {
  'use strict'

  // Get extension ID
  var extensionId = null
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    extensionId = chrome.runtime.id
  }

  // Set extension ID on window for detection (isolated world — only this script can see these)
  if (extensionId) {
    window.workStackExtensionId = extensionId
    window.workStackExtensionInstalled = true
  }

  // Inject markers into the PAGE's main world so React code can read them directly.
  // Content scripts run in an isolated world — window properties set above are invisible
  // to the page's JavaScript. This injected script runs in the main world.
  var setMarkers = function() {
    if (!extensionId) return

    try {
      var script = document.createElement('script')
      script.textContent = 'window.workStackExtensionInstalled=true;window.workStackExtensionId="' + extensionId + '";'
      ;(document.head || document.documentElement).appendChild(script)
      script.remove()
      return true
    } catch (e) {
      // CSP may block inline scripts on some pages
      return false
    }
  }

  // Try to set markers immediately
  setMarkers()

  // Keep trying if markers get cleared (some sites clear them periodically)
  var markerInterval = setInterval(function() {
    if (!window.workStackExtensionInstalled || !window.workStackExtensionId) {
      setMarkers()
    }
  }, 1000)

  // Listen for requests from the page
  window.addEventListener('message', function(event) {
    // Only accept messages from same origin
    if (event.source !== window) return

    if (event.data && event.data.type === 'workstack-request-extension-id') {
      // Send back the extension ID
      window.postMessage({
        type: 'workstack-extension-id-response',
        extensionId: extensionId
      }, '*')
    }
  })

  // Announce extension presence on page load
  function announceExtension() {
    window.postMessage({
      type: 'workstack-extension-installed',
      extensionId: extensionId
    }, '*')
  }

  // Announce immediately and keep announcing
  announceExtension()

  // Also announce when DOM is ready (in case we were too early)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceExtension)
  }

  // Clear interval on page unload
  window.addEventListener('beforeunload', function() {
    clearInterval(markerInterval)
  })
})()
