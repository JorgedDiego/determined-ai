import { Storage } from 'shared/utils/storage';

class GlobalStorage {
  private keys: Record<string, string>;
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
    this.keys = {
      authToken: 'auth-token',
      serverAddress: 'server-address',
    };
  }

  get authToken() {
    return this.storage.get<string>(this.keys.authToken) || '';
  }

  get serverAddress() {
    return this.storage.get<string>(this.keys.serverAddress) || '';
  }

  set authToken(token: string) {
    this.storage.set(this.keys.authToken, token);
  }

  set serverAddress(address: string) {
    this.storage.set(this.keys.serverAddress, address);
  }

  removeAuthToken() {
    this.storage.remove(this.keys.authToken);
  }

  removeServerAddress() {
    this.storage.remove(this.keys.serverAddress);
  }
}

export const globalStorage = new GlobalStorage(
  new Storage({ basePath: 'global', store: window.localStorage })
);
