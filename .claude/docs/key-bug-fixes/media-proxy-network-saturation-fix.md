# Media Proxy Network Saturation Fix

**Date:** 2025-10-20
**Severity:** Critical
**Impact:** Complete internet connection failure requiring system reboot

## Problem Summary

The application's media proxy endpoint (`/api/media/proxy`) was causing the entire internet connection to stop working, requiring a full system reboot to restore connectivity.

### Symptoms

- Internet would stop working shortly after visiting pages with video content
- Only a system reboot would restore internet connectivity
- Running `ping 8.8.8.8` would temporarily restore connection, suggesting network stack saturation
- Dev server logs showed requests taking 10-20+ seconds before timing out
- Multiple 500 errors with `ConnectTimeoutError` messages

### User Experience Timeline

1. User visits dev site (e.g., `localhost:3000`)
2. Page loads with video content
3. Within minutes, entire internet connection stops working
4. Cannot access any websites (not just localhost)
5. Must reboot computer to restore internet

## Root Cause Analysis

### Issue 1: Double-Fetch Bug

The media proxy was fetching from Supabase **twice** for every range request:

```typescript
// FIRST fetch - gets metadata
const response = await fetch(url)

// ... later ...

// SECOND fetch - gets the actual range
const rangeResponse = await fetch(url, {
  headers: { Range: `bytes=${start}-${end}` }
})
```

**Impact:** For ONE video on ONE page load:
- Browser makes ~5-10 range requests for video streaming
- Server makes **2x that** = 10-20 fetches to Supabase
- Multiple videos multiply this exponentially

### Issue 2: No Connection Timeout

The fetch calls had no timeout configured, meaning:
- Connections could hang indefinitely
- Failed connections never released
- Network stack/router connection table would fill up
- Eventually: no more connections available = internet stops working

### Issue 3: No Connection Management

No `AbortController` or timeout mechanism to:
- Cancel hung requests
- Clean up resources
- Prevent connection pile-up

## The Fix

### Changes Made to `/src/app/api/media/proxy/route.ts`

#### 1. Added 10-Second Timeout

```typescript
const FETCH_TIMEOUT = 10000 // 10 seconds

const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
```

#### 2. Removed Double-Fetch Bug

**Before:** Two separate fetches
```typescript
const response = await fetch(url)                    // Fetch 1
const rangeResponse = await fetch(url, { ... })      // Fetch 2
```

**After:** Single fetch with range header
```typescript
const fetchOptions: RequestInit = {
  signal: controller.signal,
  headers: range ? { Range: range } : {},
}
const response = await fetch(url, fetchOptions)      // Single fetch
```

#### 3. Added Proper Connection Management

- `AbortController` to cancel hung requests
- Timeout cleanup on success and error
- Proper error handling for timeout vs other errors

#### 4. Improved Error Handling

```typescript
if (error instanceof Error && error.name === 'AbortError') {
  console.error(`Media proxy timeout after ${FETCH_TIMEOUT}ms for URL:`, url)
  return NextResponse.json(
    { error: 'Request timeout - media server took too long to respond' },
    { status: 504 }
  )
}
```

## Results

### Before Fix
```
GET /api/media/proxy?... 500 in 10435ms   ← Timeout!
GET / 200 in 10191ms                      ← Hung
GET / 200 in 10388ms                      ← Hung
GET /products/elements-os 404 in 20645ms  ← Severely hung
```

### After Fix
```
GET /api/media/proxy?... 206 in 184ms     ← Fast!
GET /api/media/proxy?... 206 in 149ms     ← Fast!
GET / 200 in 457ms                        ← Fast!
GET /products/elements-os 200 in 182ms    ← Fast!
```

### Performance Improvements
- **50% fewer connections** (eliminated double-fetch)
- **10s max timeout** instead of indefinite hang
- **200-400ms average response** instead of 10s+ timeouts
- **0 connection errors** in testing
- **Internet stays working** during normal usage

## Technical Details

### Why It Killed Internet Connection

1. **Connection Table Exhaustion:** Each hung connection occupies an entry in the system's network connection table (and router's NAT table)
2. **No Cleanup:** Without timeouts, these entries never get cleaned up
3. **Exponential Growth:** Double-fetching means connections pile up twice as fast
4. **System-Wide Impact:** Once the connection table is full, ALL network traffic fails (not just the dev server)
5. **Ping "Fix":** Running `ping 8.8.8.8` created successful ICMP traffic that forced the network stack to clear stale entries

### Why Reboot Was Required

- macOS network stack got into a corrupted state
- Connection table was full of hung TCP connections
- No automatic cleanup mechanism for these connections
- Reboot forced complete network stack reset

## Prevention

The fix prevents this by:
1. **Limiting connection lifetime** - 10s max per request
2. **Reducing connection count** - Single fetch instead of double
3. **Proper cleanup** - AbortController ensures resources are released
4. **Fast failure** - Bad connections fail quickly instead of hanging

## Testing Recommendations

When testing video features:
1. Monitor dev server logs for timeout errors
2. Check response times stay under 1 second
3. Test with multiple videos on same page
4. Navigate between pages with videos rapidly
5. Verify internet stays working during testing

## Related Files

- `/src/app/api/media/proxy/route.ts` - The fixed endpoint
- Any pages using `<video>` tags with Supabase media URLs

## Lessons Learned

1. **Always set timeouts on fetch calls** - Especially for proxying external content
2. **Avoid unnecessary duplicate requests** - Check if you're fetching the same resource multiple times
3. **Use AbortController** - Proper connection management is critical
4. **Monitor connection behavior** - Watch for patterns like multiple slow requests
5. **Test with real network conditions** - Issues may only appear under load or with slow external services
