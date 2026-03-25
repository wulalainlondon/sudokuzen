type LegacyFacade = Record<string, (...args: any[]) => any>;

export function bindLegacyFacade(facade: LegacyFacade): void {
  Object.assign(window as unknown as Record<string, unknown>, facade);
}
