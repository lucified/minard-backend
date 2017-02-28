
export const cacheInjectSymbol = Symbol('cache');

interface CachingConfig {
    ttl: number;
}

export interface Cache {
  set<T>(key: string, value: T, options: CachingConfig | number, callback?: (error: any) => void): void;

  wrap<T>(key: string, wrapper: () => Promise<T>): Promise<T>;

  get<T>(key: string): Promise<T>;

  del(key: string): Promise<void>;
}
