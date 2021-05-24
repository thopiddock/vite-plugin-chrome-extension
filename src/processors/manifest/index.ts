import fs from "fs-extra";
import chalk from "chalk";
import memoize from "mem";
import { relative } from "path";
import { cosmiconfigSync } from "cosmiconfig";
import { EmittedAsset, OutputBundle, PluginContext, rollup, TransformPluginContext } from "rollup";
import vite, { resolveConfig, ResolvedConfig } from "vite";
import { ChromeExtensionManifest } from "../../manifest";
import { deriveFiles, ChromeExtensionManifestEntries, ChromeExtensionManifestParser, ChromeExtensionManifestEntriesDiff, ChromeExtensionManifestEntryDiff, ChromeExtensionManifestEntryArrayDiff } from "./parser";
import { reduceToRecord } from "../../manifest-input/reduceToRecord";
import { ManifestInputPluginCache } from "../../plugin-options";
import { cloneObject } from "../../utils/cloneObject";
import { manifestName } from "../../manifest-input/common/constants";
import { getAssets, getChunk } from "../../utils/bundle";
import {
    validateManifest,
    ValidationErrorsArray,
} from "../../manifest-input/manifest-parser/validate";
import { ContentScriptProcessor } from "../content-script/content-script";
import { PermissionProcessor, PermissionProcessorOptions } from "../permission";
import { BackgroundProcesser } from "../background/background";
import { NormalizedChromeExtensionOptions } from "@/configs/options";
import { ChromeExtensionManifestCache } from "./cache";
import { IComponentProcessor } from "../common";
import { OptionsPageProcessor, OptionsUiProcessor } from "../options/processor";
import { DevtoolsProcessor } from "../devtools/processor";
import { OverrideBookmarksProcessor, OverrideHistoryProcessor, OverrideNewtabProcessor } from "../override/processor";
import { PopupProcessor } from "../popup/processor";
import { WebAccessibleResourceProcessor } from "../web-accessible-resource/processor";

export const explorer = cosmiconfigSync("manifest", {
    cache: false,
});

export type ExtendManifest =
    | Partial<ChromeExtensionManifest>
    | ((manifest: ChromeExtensionManifest) => ChromeExtensionManifest);

export type ChromeExtensionConfigurationInfo = {
    filepath: string,
    config: ChromeExtensionManifest,
    isEmpty?: true,
};

export class ManifestProcessor {
    public cache2 = {
        assetChanged: false,
        assets: [],
        iife: [],
        input: [],
        inputAry: [],
        inputObj: {},
        dynamicImportContentScripts: [],
        permsHash: "",
        readFile: new Map<string, any>(),
        srcDir: null,
    } as ManifestInputPluginCache;
    public cache = new ChromeExtensionManifestCache();
    public manifestParser = new ChromeExtensionManifestParser();
    public permissionProcessor: PermissionProcessor;
    public backgroundProcessor: BackgroundProcesser;
    public contentScriptProcessor: ContentScriptProcessor;
    public popupProcessor: PopupProcessor;
    public optionsPageProcessor: OptionsPageProcessor;
    public optionsUiProcessor: OptionsUiProcessor;
    public devtoolProcessor: DevtoolsProcessor;
    public overrideBookmarksProcessor: OverrideBookmarksProcessor;
    public overrideHistoryProcessor: OverrideHistoryProcessor;
    public overrideNewTabProcessor: OverrideNewtabProcessor;
    public webAccessibleResourceProcessor: WebAccessibleResourceProcessor;

    public constructor(private options = {} as NormalizedChromeExtensionOptions) {
        this.contentScriptProcessor = new ContentScriptProcessor(options);
        this.permissionProcessor = new PermissionProcessor(new PermissionProcessorOptions());
        this.backgroundProcessor = new BackgroundProcesser(options);
        this.popupProcessor = new PopupProcessor();
        this.optionsPageProcessor = new OptionsPageProcessor();
        this.optionsUiProcessor = new OptionsUiProcessor();
        this.devtoolProcessor = new DevtoolsProcessor();
        this.overrideBookmarksProcessor = new OverrideBookmarksProcessor();
        this.overrideHistoryProcessor = new OverrideHistoryProcessor();
        this.overrideNewTabProcessor = new OverrideNewtabProcessor();
        this.webAccessibleResourceProcessor = new WebAccessibleResourceProcessor();
    }

    // file path of manifest.json
    private _filePath = "";
    public get filePath() { return this._filePath; }
    public set filePath(path: string) { this._filePath = path; }

    /**
     * Load content from manifest.json
     * @param options: rollup input options
     */
    public async resolve(manifest: ChromeExtensionManifest): Promise<void> {
        /* --------------- VALIDATE MANIFEST.JSON CONTENT --------------- */
        this.validateChromeExtensionManifest(manifest);
        /* --------------- APPLY USER CUSTOM CONFIG --------------- */
        const currentManifest = this.applyExternalManifestConfiguration(manifest);
        /* --------------- CACHE MANIFEST & ENTRIES & DIFF --------------- */
        this.cache.manifest = currentManifest;
        const entries = this.manifestParser.entries(currentManifest, this.options.rootPath!);
        // if reload manifest.json, then calculate diff and restart sub bundle tasks
        this.cache.entriesDiff = this.cache.entries
            ? this.manifestParser.diffEntries(this.cache.entries, entries) // calculate diff between the last and the current manifest
            : ChromeExtensionManifestParser.entriesToDiff(entries);
        console.log(chalk`{blue find entries}`, this.cache.entriesDiff);
        this.cache.entries = entries;
    }

    public async generateBundle() {
        if (!this.cache.entriesDiff) { return; }
        this.buildComponents(this.cache.entriesDiff);
    }

    private async buildComponents(diff: ChromeExtensionManifestEntriesDiff): Promise<void> {
        // background
        diff.background && this.buildComponent(diff.background, this.backgroundProcessor, output => {
            this.cache.manifest && (this.cache.manifest.background = { service_worker: output });
        });
        // content_scripts
        diff.content_scripts && this.buildArrayComponent(diff.content_scripts, this.contentScriptProcessor, (input, output) => {
            this.cache.manifest && this.cache.manifest.content_scripts?.forEach(group => {
                if (!group.js) { return; }
                for (let index = 0; index < group.js.length; index++) {
                    if (group.js[index] === input) {
                        group.js[index] = output;
                    }
                }
            });
        });
        // popup
        diff.popup && this.buildComponent(diff.popup, this.popupProcessor, output => {
            this.cache.manifest && this.cache.manifest.action && (this.cache.manifest.action.default_popup = output);
        });
        // options_page
        diff.options_page && this.buildComponent(diff.options_page, this.optionsPageProcessor, output => {
            this.cache.manifest && (this.cache.manifest.options_page = output);
        });
        // options_ui
        diff.options_ui && this.buildComponent(diff.options_ui, this.optionsUiProcessor, output => {
            this.cache.manifest && this.cache.manifest.options_ui && (this.cache.manifest.options_ui.page = output);
        });
        // devtools
        diff.devtools && this.buildComponent(diff.devtools, this.devtoolProcessor, output => {
            this.cache.manifest && (this.cache.manifest.devtools_page = output);
        });
        // override
        diff.override?.bookmarks && this.buildComponent(diff.override.bookmarks, this.overrideBookmarksProcessor, output => {
            this.cache.manifest && (
                this.cache.manifest.chrome_url_overrides
                    ? this.cache.manifest.chrome_url_overrides.bookmarks = output
                    : this.cache.manifest.chrome_url_overrides = { bookmarks: output });
        });
        diff.override?.history && this.buildComponent(diff.override.history, this.overrideHistoryProcessor, output => {
            this.cache.manifest && (
                this.cache.manifest.chrome_url_overrides
                    ? this.cache.manifest.chrome_url_overrides.history = output
                    : this.cache.manifest.chrome_url_overrides = { history: output });
        });
        diff.override?.newtab && this.buildComponent(diff.override.newtab, this.overrideNewTabProcessor, output => {
            this.cache.manifest && (
                this.cache.manifest.chrome_url_overrides
                    ? this.cache.manifest.chrome_url_overrides.newtab = output
                    : this.cache.manifest.chrome_url_overrides = { newtab: output });
        });
        // web_accessible_resources
        diff.web_accessible_resources && this.buildArrayComponent(diff.web_accessible_resources, this.webAccessibleResourceProcessor, (input, output) => {
            this.cache.manifest && this.cache.manifest.web_accessible_resources?.forEach(group => {
                if (!group.resources) { return; }
                for (let index = 0; index < group.resources.length; index++) {
                    if (group.resources[index] === input) {
                        group.resources[index] = output;
                    }
                }
            });
        });
    }

    private async buildComponent(
        diff: ChromeExtensionManifestEntryDiff,
        processor: IComponentProcessor,
        callback: (path: string) => void,
    ): Promise<void> {
        switch (diff.status) {
            case "create":
            case "update":
                if (diff.entry) {
                    const output = await processor.resolve(diff.entry);
                    callback(output);
                }
                break;
            case "delete":
                if (diff.entry) {
                    await processor.stop();
                    // TODO: delete output file
                }
                break;
        }
    }

    private async buildArrayComponent(
        diff: ChromeExtensionManifestEntryArrayDiff,
        processor: IComponentProcessor,
        callback: (input: string, output: string) => void,
    ): Promise<void> {
        for (const entry of diff.create || []) {
            callback(entry, await processor.resolve(entry));
        }
        for (const entry of diff.delete || []) {
            await processor.stop();
        }
    }

    public toString() {
        return JSON.stringify(this.cache.manifest, null, 4);
    }

    /**
     * Resolve input files for rollup
     * @param input: Input not in manifest.json but specify by user
     * @returns
     */
    public resolveEntries(manifest: ChromeExtensionManifest): { [entryAlias: string]: string } {
        if (!manifest || !this.options.rootPath) {
            throw new TypeError("manifest and options.srcDir not initialized");
        }
        // Derive all static resources from manifest
        // Dynamic entries will emit in transform hook
        const { js, html, css, img, others } = deriveFiles(
            manifest,
            this.options.rootPath,
        );
        // Cache derived inputs
        this.cache2.input = [...this.cache2.inputAry, ...js, ...html];
        this.cache2.assets = [...new Set([...css, ...img, ...others])];
        const inputs = this.cache2.input.reduce(
            reduceToRecord(this.options.rootPath),
            this.cache2.inputObj);
        return inputs;
    }

    public transform(context: TransformPluginContext, code: string, id: string, ssr?: boolean) {
        const { code:updatedCode, imports } = this.backgroundProcessor.resolveDynamicImports(context, code);
        this.cache2.dynamicImportContentScripts.push(...imports);
        return updatedCode;
    }

    public isDynamicImportedContentScript(referenceId: string) {
        return this.cache2.dynamicImportContentScripts.includes(referenceId);
    }

    /**
     * Add watch files
     * @param context Rollup Plugin Context
     */
    public addWatchFiles(context: PluginContext) {
        // watch manifest.json file
        context.addWatchFile(this.options.manifestPath!);
        // watch asset files
        this.cache2.assets.forEach(srcPath => context.addWatchFile(srcPath));
    }

    public async emitFiles(context: PluginContext) {
        // Copy asset files
        const assets: EmittedAsset[] = await Promise.all(
            this.cache2.assets.map(async (srcPath) => {
                const source = await this.readAssetAsBuffer(srcPath);
                return {
                    type: "asset" as const,
                    source,
                    fileName: relative(this.options.rootPath!, srcPath),
                };
            }),
        );
        assets.forEach((asset) => {
            context.emitFile(asset);
        });
    }

    public clearCacheById(id: string) {
        if (id.endsWith(manifestName)) {
            // Dump cache.manifest if manifest changes
            delete this.cache.manifest;
            this.cache2.assetChanged = false;
        } else {
            // Force new read of changed asset
            this.cache2.assetChanged = this.cache2.readFile.delete(id);
        }
    }

    // public async generateBundle(context: PluginContext, bundle: OutputBundle) {
    //     if (!this.cache.manifest) { throw new Error("[generate bundle] Manifest cannot be empty"); }
    //     /* ----------------- GET CHUNKS -----------------*/
    //     const chunks = getChunk(bundle);
    //     const assets = getAssets(bundle);
    //     /* ----------------- UPDATE PERMISSIONS ----------------- */
    //     this.permissionProcessor.derivePermissions(context, chunks, this.cache.manifest);
    //     /* ----------------- UPDATE CONTENT SCRIPTS ----------------- */
    //     await this.contentScriptProcessor.generateBundle(context, bundle, this.cache.manifest);
    //     await this.contentScriptProcessor.generateBundleFromDynamicImports(context, bundle, this.cache2.dynamicImportContentScripts);
    //     /* ----------------- SETUP BACKGROUND SCRIPTS ----------------- */
    //     await this.backgroundProcessor.generateBundle(context, bundle, this.cache.manifest);
    //     /* ----------------- SETUP ASSETS IN WEB ACCESSIBLE RESOURCES ----------------- */

    //     /* ----------------- STABLE EXTENSION ID ----------------- */
    //     /* ----------------- OUTPUT MANIFEST.JSON ----------------- */
    //     /* ----------- OUTPUT MANIFEST.JSON ---------- */
    //     this.generateManifest(context, this.cache.manifest);
    //     // validate manifest
    //     this.validateManifest();
    // }

    private validateChromeExtensionManifest(manifest: ChromeExtensionManifest) {
        const { options_page, options_ui } = manifest;
        if (
            options_page !== undefined &&
            options_ui !== undefined
        ) {
            throw new Error(
                "options_ui and options_page cannot both be defined in manifest.json.",
            );
        }
    }

    private validateManifest() {
        if (this.cache.manifest) {
            validateManifest(this.cache.manifest)
        } else {
            throw new Error("Manifest cannot be empty");
        }
    }

    private applyExternalManifestConfiguration(manifest: ChromeExtensionManifest): ChromeExtensionManifest {
        if (typeof this.options.extendManifest === "function") {
            return this.options.extendManifest(manifest);
        } else if (typeof this.options.extendManifest === "object") {
            return {
                ...manifest,
                ...this.options.extendManifest,
            };
        } else {
            return manifest;
        }
    }

    private readAssetAsBuffer = memoize(
        (filepath: string) => {
            return fs.readFile(filepath);
        },
        {
            cache: this.cache2.readFile,
        },
    );

    private generateManifest(
        context: PluginContext,
        manifest: ChromeExtensionManifest,
    ) {
        const manifestJson = JSON.stringify(manifest, null, 4)
            // SMELL: is this necessary?
            .replace(/\.[jt]sx?"/g, '.js"');
        // Emit manifest.json
        context.emitFile({
            type: "asset",
            fileName: manifestName,
            source: manifestJson,
        });
    }
}
