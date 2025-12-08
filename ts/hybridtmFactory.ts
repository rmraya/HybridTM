import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HybridTM } from "./hybridtm";

export interface HybridTMInstanceMetadata {
    name: string;
    filePath: string;
    modelName: string;
    createdAt: string;
}

export class HybridTMFactory {

    private static readonly STORAGE_FILE_NAME: string = "instances.json";

    private readonly storageDir: string;
    private readonly registryFile: string;
    private readonly registry: Map<string, HybridTMInstanceMetadata> = new Map<string, HybridTMInstanceMetadata>();
    private loaded: boolean = false;
    private loadingPromise: Promise<void> | null = null;

    constructor() {
        this.storageDir = HybridTMFactory.resolveStorageDirectory();
        this.registryFile = path.join(this.storageDir, HybridTMFactory.STORAGE_FILE_NAME);
    }

    async getWorkingDirectory(): Promise<string> {
        await fs.mkdir(this.storageDir, { recursive: true });
        return this.storageDir;
    }

    private static resolveStorageDirectory(): string {
        const platform: NodeJS.Platform = os.platform();
        if (platform === "win32") {
            const appData: string | undefined = process.env.APPDATA;
            if (appData && appData.length > 0) {
                return path.join(appData, "HybridTM");
            }
            return path.join(os.homedir(), "AppData", "Roaming", "HybridTM");
        }
        if (platform === "darwin") {
            return path.join(os.homedir(), "Library", "Application Support", "HybridTM");
        }
        return path.join(os.homedir(), ".config", "HybridTM");
    }

    private async ensureLoaded(): Promise<void> {
        if (this.loaded) {
            return;
        }
        if (!this.loadingPromise) {
            this.loadingPromise = this.loadRegistry();
        }
        await this.loadingPromise;
        this.loaded = true;
    }

    private async loadRegistry(): Promise<void> {
        await fs.mkdir(this.storageDir, { recursive: true });
        try {
            const raw: string = await fs.readFile(this.registryFile, "utf-8");
            const data: unknown = JSON.parse(raw);
            if (Array.isArray(data)) {
                this.registry.clear();
                for (const entry of data) {
                    if (entry && typeof entry === "object") {
                        const metadata: HybridTMInstanceMetadata | null = this.coerceMetadata(entry as Record<string, unknown>);
                        if (metadata) {
                            this.registry.set(metadata.name, metadata);
                        }
                    }
                }
            }
        } catch (err: unknown) {
            const nodeErr: NodeJS.ErrnoException = err as NodeJS.ErrnoException;
            if (nodeErr.code === "ENOENT") {
                this.registry.clear();
                return;
            }
            throw err;
        }
    }

    private coerceMetadata(entry: Record<string, unknown>): HybridTMInstanceMetadata | null {
        const name: unknown = entry.name;
        const filePath: unknown = entry.filePath;
        const modelName: unknown = entry.modelName;
        if (typeof name !== "string" || typeof filePath !== "string" || typeof modelName !== "string") {
            return null;
        }
        const createdAt: string = typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString();
        return {
            name,
            filePath,
            modelName,
            createdAt
        };
    }

    private async persistRegistry(): Promise<void> {
        const serialized: string = JSON.stringify(Array.from(this.registry.values()), null, 2);
        await fs.mkdir(this.storageDir, { recursive: true });
        await fs.writeFile(this.registryFile, serialized, "utf-8");
    }

    async listInstances(): Promise<HybridTMInstanceMetadata[]> {
        await this.ensureLoaded();
        const entries: HybridTMInstanceMetadata[] = Array.from(this.registry.values()).map((metadata: HybridTMInstanceMetadata) => ({ ...metadata }));
        entries.sort((a: HybridTMInstanceMetadata, b: HybridTMInstanceMetadata) => a.name.localeCompare(b.name));
        return entries;
    }

    async createInstance(name: string, filePath: string, modelName: string): Promise<HybridTM> {
        const trimmedName: string = name.trim();
        if (trimmedName.length === 0) {
            throw new Error("Friendly name must not be empty");
        }
        await this.ensureLoaded();
        if (this.registry.has(trimmedName)) {
            throw new Error("An instance with the provided name already exists");
        }
        const resolvedPath: string = path.resolve(filePath);
        const now: string = new Date().toISOString();
        const metadata: HybridTMInstanceMetadata = {
            name: trimmedName,
            filePath: resolvedPath,
            modelName,
            createdAt: now
        };
        await fs.mkdir(resolvedPath, { recursive: true });
        this.registry.set(trimmedName, metadata);
        await this.persistRegistry();
        return new HybridTM(resolvedPath, modelName);
    }

    async openInstance(name: string): Promise<HybridTM> {
        await this.ensureLoaded();
        const metadata: HybridTMInstanceMetadata | undefined = this.registry.get(name);
        if (!metadata) {
            throw new Error("Requested instance does not exist");
        }
        const exists: boolean = await fs.stat(metadata.filePath).then(() => true).catch(() => false);
        if (!exists) {
            this.registry.delete(name);
            await this.persistRegistry();
            throw new Error("Stored database path was not found on disk");
        }
        await this.persistRegistry();
        return new HybridTM(metadata.filePath, metadata.modelName);
    }

    async removeInstance(name: string): Promise<void> {
        await this.ensureLoaded();
        const metadata: HybridTMInstanceMetadata | undefined = this.registry.get(name);
        if (!metadata) {
            throw new Error("Requested instance does not exist");
        }
        this.registry.delete(name);
        await this.persistRegistry();
        await fs.rm(metadata.filePath, { recursive: true, force: true });
    }
}
