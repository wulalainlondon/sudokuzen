export interface StorageMigration {
  version: number;
  canApply: (currentVersion: number) => boolean;
  apply: () => void;
}
