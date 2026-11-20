import { editDocument, type ResumeDocument, type Snapshot } from '../shared/schemas.js';
import type { DraftStore, CommitAction, CommitOptions } from './storage.js';

import type { Assets, PortraitAsset } from './portrait/assets.js';
export type DraftState = {
    document: ResumeDocument | null;
    history: Snapshot[];
    status: string;
    error: string;
    busy: boolean;
    assets: Assets;
};

// One owner for the document and all save feedback, shared by the page and timing tests.
export class DraftSession {
    private state: DraftState = { document: null, history: [], status: '正在读取本地草稿…', error: '', busy: false, assets: {} };
    private store: Pick<DraftStore, 'commit'> | null = null;
    private savedRevision: number | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private timer: ReturnType<typeof setTimeout> | undefined;
    private generation = 0;
    private listeners = new Set<() => void>();
    getSnapshot = () => this.state;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private publish(update: Partial<DraftState>) {
        this.state = { ...this.state, ...update };
        this.listeners.forEach(listener => listener());
    }
    attach(store: Pick<DraftStore, 'commit'> | null, document: ResumeDocument, history: Snapshot[], persisted: boolean, assets: Assets = {}) {
        this.store = store;
        this.savedRevision = persisted ? document.revision : null;
        this.publish({ document, history, assets, status: persisted ? '已恢复此浏览器草稿' : store ? '空白草稿，尚未填写' : '仅本页编辑 · 未保存', error: '' });
        if (store && !persisted) this.schedule();
    }
    get hasStore() { return this.store !== null; }
    get unsaved() { return this.state.document !== null && this.savedRevision !== this.state.document.revision; }
    edit(change: (document: ResumeDocument) => void) {
        if (!this.state.document || this.state.busy) return;
        this.generation++;
        this.publish({ document: editDocument(this.state.document, change), status: '尚未保存 · 正在等待写入', error: '' });
        this.schedule();
    }
    private schedule() {
        clearTimeout(this.timer);
        if (!this.store) { this.publish({ status: '仅本页编辑 · 未保存' }); return; }
        this.timer = setTimeout(() => { void this.save('draft'); }, 350);
    }
    async save(action: CommitAction = 'draft', target?: Snapshot, options: CommitOptions = {}) {
        if (!this.state.document || this.state.busy) return;
        clearTimeout(this.timer);
        const current = this.state.document;
        const generation = ++this.generation;
        const exclusive = action !== 'draft';
        this.publish({ busy: exclusive, error: '', status: action === 'restore' ? '正在备份并恢复…' : action === 'import' ? '正在应用初稿并备份 · 无法取消' : '正在保存…' });
        const job = this.queue.then(async () => {
            if (!this.store) throw new Error('当前仅在本页编辑，未写入本地存储。关闭前请保留内容。');
            const result = await this.store.commit(current, this.savedRevision, action, target, options);
            this.savedRevision = result.document.revision;
            const incoming = result.assets;
            const unchanged = incoming && Object.keys(incoming).length === Object.keys(this.state.assets).length && Object.keys(incoming).every(id=>id in this.state.assets);
            this.publish({ history: result.history, assets: incoming && !unchanged ? incoming : this.state.assets });
            return result;
        });
        this.queue = job.catch(() => undefined);
        try {
            const result = await job;
            if (generation === this.generation) this.publish({
                document: action !== 'draft' && action !== 'snapshot' && action !== 'delete' ? result.document : this.state.document,
                error: '', status: action === 'restore' ? '已恢复，恢复前的编辑已备份' : action === 'snapshot' ? '版本已保存到当前浏览器' : '已保存到当前浏览器'
            });
        } catch (error) {
            if (generation === this.generation) this.publish({ status: '保存失败 · 内容仍在本页', error: error instanceof Error ? error.message : '保存失败，请重试。' });
        } finally {
            if (exclusive) this.publish({ busy: false });
        }
    }
    async apply(replacement: ResumeDocument, action: 'import'|'portrait'|'suggestion', baseRevision: number, assets: PortraitAsset[] = []) {
        if (this.state.document?.revision !== baseRevision || this.state.busy) throw new Error('任务结果已过期，当前编辑未改变，请重新操作。');
        await this.save(action, undefined, {replacement, assets});
        if (this.state.error || this.state.document?.revision !== replacement.revision) throw new Error(this.state.error || '应用版本失败，当前编辑未改变。');
    }
    dispose() { clearTimeout(this.timer); this.generation++; }
}
