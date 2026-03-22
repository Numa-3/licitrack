'use client'

import { useState, useEffect } from 'react'

export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    function handleOffline() { setOffline(true) }
    function handleOnline() { setOffline(false) }

    // Check initial state
    if (!navigator.onLine) setOffline(true)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-red-600 text-white text-center text-sm py-2 px-4 font-medium">
      Sin conexión. Los cambios se guardarán cuando vuelva internet.
    </div>
  )
}
