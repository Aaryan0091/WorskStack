// Chrome Extension API types
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage(
          extensionId: string,
          message: Record<string, unknown>,
          callback?: (response: Record<string, unknown> | undefined) => void
        ): void
        lastError?: { message: string }
      }
    }
  }
}

export {}
