import { ChromeExtensionModule } from "@/common/models";
import { ChromeExtensionManifest } from "@/manifest";
import { WatcherOptions } from "rollup";
import { Plugin } from "vite";
import { IComponentProcessor } from "../common";
import { OverrideBookmarksProcessorCache, OverrideHistoryProcessorCache, OverrideNewtabProcessorCache } from "./cache";

export interface OverrideBookmarksProcessorOptions {
    watch?: boolean | WatcherOptions | null;
    plugins?: Plugin[];
}

export interface NormalizedOverrideBookmarksProcessorOptions {
    watch: WatcherOptions | null | undefined;
    plugins: Plugin[],
}

const DefaultOverrideBookmarksProcessorOptions: NormalizedOverrideBookmarksProcessorOptions = {
    watch: undefined,
    plugins: [],
};

export class OverrideBookmarksProcessor implements IComponentProcessor {
    private _options: NormalizedOverrideBookmarksProcessorOptions;
    private _cache = new OverrideBookmarksProcessorCache();

    public resolve(manifest: ChromeExtensionManifest): void {
        manifest.chrome_url_overrides?.bookmarks
            && (this._cache.entry = manifest.chrome_url_overrides.bookmarks);
    }

    public async build(): Promise<ChromeExtensionModule> {
        if (!this._cache.entry) {
            this._cache.module = ChromeExtensionModule.Empty;
        } else {
            if (this._cache.module.entry !== this._cache.entry) {
                throw new Error("Method not implemented.");
            }
        }
        return this._cache.module;
    }

    public constructor(options: OverrideBookmarksProcessorOptions = {}) {
        this._options = this.normalizeOptions(options);
    }
    private normalizeOptions(options: OverrideBookmarksProcessorOptions): NormalizedOverrideBookmarksProcessorOptions {
        const normalizedOptions = { ...options };
        if (normalizedOptions.watch === false || normalizedOptions.watch === undefined) {
            normalizedOptions.watch = undefined;
        } else if (normalizedOptions.watch === true) {
            normalizedOptions.watch = {};
        }
        if (!normalizedOptions.plugins) { normalizedOptions.plugins = DefaultOverrideBookmarksProcessorOptions.plugins; }
        return normalizedOptions as NormalizedOverrideBookmarksProcessorOptions;
    }
}

export interface OverrideHistoryProcessorOptions {
    watch?: boolean | WatcherOptions | null;
    plugins?: Plugin[];
}

export interface NormalizedOverrideHistoryProcessorOptions {
    watch: WatcherOptions | null | undefined;
    plugins: Plugin[],
}

const DefaultOverrideHistoryProcessorOptions: NormalizedOverrideHistoryProcessorOptions = {
    watch: undefined,
    plugins: [],
};

export class OverrideHistoryProcessor implements IComponentProcessor {
    private _options: NormalizedOverrideHistoryProcessorOptions;
    private _cache = new OverrideHistoryProcessorCache();

    public resolve(manifest: ChromeExtensionManifest): void {
        manifest.chrome_url_overrides?.history
            && (this._cache.entry = manifest.chrome_url_overrides.history);
    }

    public async build(): Promise<ChromeExtensionModule> {
        if (!this._cache.entry) {
            this._cache.module = ChromeExtensionModule.Empty;
        } else {
            if (this._cache.module.entry !== this._cache.entry) {
                throw new Error("Method not implemented.");
            }
        }
        return this._cache.module;
    }

    public constructor(options: OverrideHistoryProcessorOptions = {}) {
        this._options = this.normalizeOptions(options);
    }
    private normalizeOptions(options: OverrideHistoryProcessorOptions): NormalizedOverrideHistoryProcessorOptions {
        const normalizedOptions = { ...options };
        if (normalizedOptions.watch === false || normalizedOptions.watch === undefined) {
            normalizedOptions.watch = undefined;
        } else if (normalizedOptions.watch === true) {
            normalizedOptions.watch = {};
        }
        if (!normalizedOptions.plugins) { normalizedOptions.plugins = DefaultOverrideHistoryProcessorOptions.plugins; }
        return normalizedOptions as NormalizedOverrideHistoryProcessorOptions;
    }
}

export interface OverrideNewtabProcessorOptions {
    watch?: boolean | WatcherOptions | null;
    plugins?: Plugin[];
}

export interface NormalizedOverrideNewtabProcessorOptions {
    watch: WatcherOptions | null | undefined;
    plugins: Plugin[],
}

const DefaultOverrideNewtabProcessorOptions: NormalizedOverrideNewtabProcessorOptions = {
    watch: undefined,
    plugins: [],
};

export class OverrideNewtabProcessor implements IComponentProcessor {
    private _options: NormalizedOverrideNewtabProcessorOptions;
    private _cache = new OverrideNewtabProcessorCache();

    public resolve(manifest: ChromeExtensionManifest): void {
        manifest.chrome_url_overrides?.newtab
            && (this._cache.entry = manifest.chrome_url_overrides.newtab);
    }

    public async build(): Promise<ChromeExtensionModule> {
        if (!this._cache.entry) {
            this._cache.module = ChromeExtensionModule.Empty;
        } else {
            if (this._cache.module.entry !== this._cache.entry) {
                throw new Error("Method not implemented.");
            }
        }
        return this._cache.module;
    }

    public constructor(options: OverrideNewtabProcessorOptions = {}) {
        this._options = this.normalizeOptions(options);
    }
    private normalizeOptions(options: OverrideNewtabProcessorOptions): NormalizedOverrideNewtabProcessorOptions {
        const normalizedOptions = { ...options };
        if (normalizedOptions.watch === false || normalizedOptions.watch === undefined) {
            normalizedOptions.watch = undefined;
        } else if (normalizedOptions.watch === true) {
            normalizedOptions.watch = {};
        }
        if (!normalizedOptions.plugins) { normalizedOptions.plugins = DefaultOverrideNewtabProcessorOptions.plugins; }
        return normalizedOptions as NormalizedOverrideNewtabProcessorOptions;
    }
}
