// jsdom has no IndexedDB. Tests that touch storage use a real Dexie on this in-memory factory.
import 'fake-indexeddb/auto';
