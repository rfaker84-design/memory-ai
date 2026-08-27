/** Public product routes share one app-session opening, never one opening per page. */
export function isPublicProductRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/guest" || pathname.startsWith("/guest/");
}
