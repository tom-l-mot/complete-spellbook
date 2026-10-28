import type { ActorDocument, Environment, ItemDocument } from './runtime.ts';
type Context = Record<string, unknown>;
declare global {
  const game: Environment & {
    system: { id: string; version: string };
    release: { generation: number };
    i18n: { localize(key: string): string };
    users: { contents: { id: string; active: boolean; isGM: boolean }[] };
    actors: { contents: ActorDocument[] };
    modules: { get(id: string): { api?: unknown } | undefined };
    settings: Environment['settings'] & { register(scope: string, key: string, options: Context): void };
  };
  const ui: { notifications: { info(message: string): void; warn(message: string): void; error(message: string): void } };
  const Hooks: {
    on(name: string, callback: (...args: never[]) => unknown): number;
    once(name: string, callback: () => unknown): number;
  };
  const foundry: {
    utils: { randomID(): string };
    applications: {
      api: {
        ApplicationV2: typeof ApplicationBase;
        HandlebarsApplicationMixin(base: typeof ApplicationBase): typeof ApplicationBase;
        DialogV2: {
          confirm(options: Context): Promise<boolean>;
          input(options: Context): Promise<Record<string, unknown> | null>;
        };
      };
    };
  };
  class ApplicationBase {
    static DEFAULT_OPTIONS: Context;
    static PARTS: Context;
    element: HTMLElement;
    rendered: boolean;
    constructor(options?: Context);
    render(options?: { force?: boolean }): Promise<this>;
    close(options?: Context): Promise<this>;
    protected _prepareContext(options: Context): Promise<Context>;
    protected _onRender(context: Context, options: Context): void;
  }
}
export type SheetApplication = { actor?: ActorDocument; document?: ActorDocument; options?: Context };
export type ItemHookDocument = ItemDocument & { actor?: ActorDocument; pack?: string };
