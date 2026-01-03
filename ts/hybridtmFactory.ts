/*******************************************************************************
 * Copyright (c) 2025-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from 'node:path';
import { HybridTM } from './hybridtm.js';

export interface HybridTMInstanceMetadata {
    name: string;
    filePath: string;
    modelName: string;
    createdAt: string;
}

export class HybridTMFactory {

    private static readonly STORAGE_FILE_NAME: string = 'instances.json';
    private static singleton: HybridTMFactory | null = null;

    private readonly storageDir: string;
    private readonly registryFile: string;
    private readonly registry: Map<string, HybridTMInstanceMetadata> = new Map<string, HybridTMInstanceMetadata>();
    private loaded: boolean = false;

    private constructor() {
        this.storageDir = HybridTMFactory.resolveStorageDirectory();
        this.registryFile = path.join(this.storageDir, HybridTMFactory.STORAGE_FILE_NAME);
    }

    static listInstances(): HybridTMInstanceMetadata[] {
        return HybridTMFactory.getSingleton().listInstancesInternal();
    }

    static createInstance(name: string, filePath: string, modelName: string): HybridTM {
        return HybridTMFactory.getSingleton().createInstanceInternal(name, filePath, modelName);
    }

    static getInstance(name: string): HybridTM | undefined {
        return HybridTMFactory.getSingleton().getInstanceInternal(name);
    }

    static removeInstance(name: string): void {
        HybridTMFactory.getSingleton().removeInstanceInternal(name);
    }

    static getWorkingDirectory(): string {
        return HybridTMFactory.getSingleton().getWorkingDirectoryInternal();
    }

    private static resolveStorageDirectory(): string {
        const platform: NodeJS.Platform = os.platform();
        if (platform === 'win32') {
            const appData: string | undefined = process.env.APPDATA;
            if (appData && appData.length > 0) {
                return path.join(appData, 'HybridTM');
            }
            return path.join(os.homedir(), 'AppData', 'Roaming', 'HybridTM');
        }
        if (platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', 'HybridTM');
        }
        return path.join(os.homedir(), '.config', 'HybridTM');
    }

    private static getSingleton(): HybridTMFactory {
        if (!HybridTMFactory.singleton) {
            HybridTMFactory.singleton = new HybridTMFactory();
        }
        return HybridTMFactory.singleton;
    }

    private listInstancesInternal(): HybridTMInstanceMetadata[] {
        this.ensureLoaded();
        const entries: HybridTMInstanceMetadata[] = Array.from(this.registry.values()).map((metadata: HybridTMInstanceMetadata) => ({ ...metadata }));
        entries.sort((a: HybridTMInstanceMetadata, b: HybridTMInstanceMetadata) => a.name.localeCompare(b.name));
        return entries;
    }

    private createInstanceInternal(name: string, filePath: string, modelName: string): HybridTM {
        const trimmedName: string = name.trim();
        if (trimmedName.length === 0) {
            throw new Error('Name must not be empty');
        }
        this.ensureLoaded();
        if (this.registry.has(trimmedName)) {
            throw new Error('An instance with the provided name already exists');
        }
        const resolvedPath: string = path.resolve(filePath);
        const now: string = new Date().toISOString();
        const metadata: HybridTMInstanceMetadata = {
            name: trimmedName,
            filePath: resolvedPath,
            modelName,
            createdAt: now
        };
        mkdirSync(resolvedPath, { recursive: true });
        this.registry.set(trimmedName, metadata);
        this.persistRegistry();
        return new HybridTM(trimmedName, resolvedPath, modelName);
    }

    private getInstanceInternal(name: string): HybridTM | undefined {
        this.ensureLoaded();
        const metadata: HybridTMInstanceMetadata | undefined = this.registry.get(name);
        if (!metadata) {
            return undefined;
        }
        if (!existsSync(metadata.filePath)) {
            this.registry.delete(name);
            this.persistRegistry();
            return undefined;
        }
        return new HybridTM(name, metadata.filePath, metadata.modelName);
    }

    private removeInstanceInternal(name: string): void {
        this.ensureLoaded();
        const metadata: HybridTMInstanceMetadata | undefined = this.registry.get(name);
        if (!metadata) {
            throw new Error('Requested instance does not exist');
        }
        this.registry.delete(name);
        this.persistRegistry();
        rmSync(metadata.filePath, { recursive: true, force: true });
    }

    private getWorkingDirectoryInternal(): string {
        mkdirSync(this.storageDir, { recursive: true });
        return this.storageDir;
    }

    private ensureLoaded(): void {
        if (this.loaded) {
            return;
        }
        this.loadRegistry();
        this.loaded = true;
    }

    private loadRegistry(): void {
        mkdirSync(this.storageDir, { recursive: true });
        if (!existsSync(this.registryFile)) {
            this.registry.clear();
            return;
        }
        const raw: string = readFileSync(this.registryFile, { encoding: 'utf-8' });
        const data: unknown = JSON.parse(raw);
        if (Array.isArray(data)) {
            this.registry.clear();
            for (const entry of data) {
                if (entry && typeof entry === 'object') {
                    const metadata: HybridTMInstanceMetadata | null = this.coerceMetadata(entry as Record<string, unknown>);
                    if (metadata) {
                        this.registry.set(metadata.name, metadata);
                    }
                }
            }
        }
    }

    private coerceMetadata(entry: Record<string, unknown>): HybridTMInstanceMetadata | null {
        const name: unknown = entry.name;
        const filePath: unknown = entry.filePath;
        const modelName: unknown = entry.modelName;
        if (typeof name !== 'string' || typeof filePath !== 'string' || typeof modelName !== 'string') {
            return null;
        }
        const createdAt: string = typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString();
        return {
            name,
            filePath,
            modelName,
            createdAt
        };
    }

    private persistRegistry(): void {
        const serialized: string = JSON.stringify(Array.from(this.registry.values()), null, 2);
        mkdirSync(this.storageDir, { recursive: true });
        writeFileSync(this.registryFile, serialized, { encoding: 'utf-8' });
    }
}
