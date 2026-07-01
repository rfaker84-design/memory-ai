import type { AIProvider } from "./ai-provider";
import { AIProviderType } from "./provider-types";

export class AIProviderRegistry {
  private providers = new Map<AIProviderType, AIProvider[]>();

  register(provider: AIProvider): void {
    const list = this.providers.get(provider.providerType) ?? [];
    list.push(provider);
    this.providers.set(provider.providerType, list);
  }

  unregister(provider: AIProvider): void {
    const list = this.providers.get(provider.providerType);

    if (!list) return;

    this.providers.set(
      provider.providerType,
      list.filter((p) => p.providerName !== provider.providerName)
    );
  }

  get<T extends AIProvider>(
    type: AIProviderType,
    name?: string
  ): T | undefined {
    const list = this.providers.get(type);

    if (!list || list.length === 0) return undefined;

    if (name) {
      return list.find((p) => p.providerName === name) as T | undefined;
    }

    return list[0] as T | undefined;
  }

  list(type?: AIProviderType): AIProvider[] {
    if (type) {
      return this.providers.get(type) ?? [];
    }

    return Array.from(this.providers.values()).flat();
  }
}
