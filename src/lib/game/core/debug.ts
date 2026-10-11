// ============ RIFT BRAWL — debug tooling gate ============
//
// window.__match / __net / __rb are QA escape hatches — handy in a browser
// test harness, but shipping globals that hand the whole engine to any page
// script is not a great permanent API. They are now opt-in per page load:
// append ?debug (or #debug) to the URL and they come back.

export function debugToolsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const loc = (window as unknown as { location?: { search?: string; hash?: string } }).location;
  const search = loc?.search ?? '';
  const hash = loc?.hash ?? '';
  return /[?&]debug\b/.test(search) || /(^|[#&])debug\b/.test(hash);
}
