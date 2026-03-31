export default function Loading() {
  return (
    <div className="p-6 md:p-10 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 w-48 bg-gray-200 rounded-lg mb-6" />

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
            <div className="h-6 w-28 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="h-5 w-32 bg-gray-200 rounded" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <div className="h-4 w-8 bg-gray-100 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
              <div className="h-5 w-16 bg-gray-100 rounded-full" />
              <div className="h-4 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
