import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export class OptOuts {
  ids = new Set<string>();
  private pending = Promise.resolve();
  constructor(private directory: string) {}
  async load() {
    try {
      const data: unknown = JSON.parse(await readFile(join(this.directory, 'optouts.json'), 'utf8'));
      if (!Array.isArray(data) || !data.every(x => typeof x === 'string')) throw new Error('Invalid optouts.json; repair it before startup');
      this.ids = new Set(data);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  set(id: string, hidden: boolean): Promise<void> {
    const task = this.pending.then(async () => {
      const next = new Set(this.ids); hidden ? next.add(id) : next.delete(id);
      await mkdir(this.directory, { recursive: true });
      const temp = join(this.directory, 'optouts.json.tmp');
      await writeFile(temp, JSON.stringify([...next], null, 2));
      await rename(temp, join(this.directory, 'optouts.json'));
      this.ids.clear(); for (const item of next) this.ids.add(item);
    });
    this.pending = task.catch(() => {});
    return task;
  }
}
