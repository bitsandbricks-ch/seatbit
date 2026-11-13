// Cache invalidation needs a Next.js request; outside one it's a no-op.
exports.revalidatePath = function revalidatePath() {}
exports.revalidateTag = function revalidateTag() {}
exports.updateTag = function updateTag() {}
exports.refresh = function refresh() {}
exports.unstable_cache = function unstable_cache(fn) {
  return fn;
}
exports.unstable_noStore = function unstable_noStore() {}
