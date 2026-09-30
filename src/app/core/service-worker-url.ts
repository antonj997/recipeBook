// Chromium's Trusted Types also protects serviceWorker.register(). Angular's
// registration helper accepts a string, so preserve the trusted object at runtime.
export function serviceWorkerUrl(): string {
  const url = new URL('ngsw-worker.js', document.baseURI).href;
  const factory = (
    window as Window & {
      trustedTypes?: {
        createPolicy(
          name: string,
          rules: { createScriptURL(value: string): string },
        ): {
          createScriptURL(value: string): unknown;
        };
      };
    }
  ).trustedTypes;
  if (!factory) return url;
  const policy = factory.createPolicy('recipebook#worker', {
    createScriptURL(value) {
      if (value !== url) throw new Error('Unexpected service worker URL.');
      return url;
    },
  });
  return policy.createScriptURL(url) as string;
}
