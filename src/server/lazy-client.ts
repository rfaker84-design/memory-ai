export function createLazyClient<Client extends object>(
  factory: () => Client
): Client {
  let client: Client | undefined;

  const resolve = (): Client => {
    client ??= factory();
    return client;
  };

  return new Proxy({} as Client, {
    get(_target, property) {
      const resolved = resolve();
      const value = Reflect.get(resolved, property, resolved) as unknown;
      return typeof value === "function" ? value.bind(resolved) : value;
    },
    set(_target, property, value) {
      return Reflect.set(resolve(), property, value);
    },
  });
}
