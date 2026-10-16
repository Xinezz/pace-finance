import type { AppData } from '../domain/types';
import { ConflictError, type DataStore } from '../storage/dataStore';
import { sanitizeAppData } from '../storage/sanitize';
import type { DocumentGateway } from './types';

/**
 * Stores the whole Pace document in the signed-in user's cloud row.
 *
 * It remembers the version it last saw and only writes if that is still current. If another device
 * saved in the meantime, the write is refused and a ConflictError surfaces, so work is never
 * overwritten without the person choosing.
 */
export class CloudDataStore implements DataStore {
  readonly kind = 'cloud' as const;
  private version = 0;

  constructor(private readonly gateway: DocumentGateway) {}

  async load(): Promise<AppData | null> {
    const doc = await this.gateway.fetch();
    if (!doc) {
      this.version = 0;
      return null;
    }
    this.version = doc.version;
    // Never trust stored JSON blindly: repair or drop anything malformed before the app sees it.
    return sanitizeAppData(doc.data).data;
  }

  async save(next: AppData): Promise<void> {
    const result = await this.gateway.write(next, this.version);
    if (!result.ok) throw new ConflictError(result.remoteVersion);
    this.version = result.version;
  }

  async clear(): Promise<void> {
    await this.gateway.remove();
    this.version = 0;
  }

  acceptRemote(remoteVersion: number): void {
    this.version = remoteVersion;
  }
}
