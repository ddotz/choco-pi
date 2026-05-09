export interface VersionSyncInput {
  currentPackageJson: string;
  headPackageJson?: string;
  currentLockfile?: string;
  headLockfile?: string;
  currentPluginVersion: string;
}

export interface VersionSyncResult {
  ok: boolean;
  issues: string[];
}

type PackageJsonLike = {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  packageManager?: string;
};

function parsePackageJson(raw: string): PackageJsonLike {
  return JSON.parse(raw) as PackageJsonLike;
}

function stableDependencyMetadata(pkg: PackageJsonLike): string {
  return JSON.stringify({
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {},
    peerDependencies: pkg.peerDependencies ?? {},
    optionalDependencies: pkg.optionalDependencies ?? {},
    packageManager: pkg.packageManager ?? "",
  });
}

export function analyzeVersionSync(input: VersionSyncInput): VersionSyncResult {
  const issues: string[] = [];
  const currentPackage = parsePackageJson(input.currentPackageJson);
  const currentPackageVersion = currentPackage.version;

  if (!currentPackageVersion) {
    issues.push("package.json is missing version");
  }

  if (currentPackageVersion && currentPackageVersion !== input.currentPluginVersion) {
    issues.push("package.json version and plugin version constant differ");
  }

  if (input.headPackageJson) {
    const headPackage = parsePackageJson(input.headPackageJson);
    const packageChanged = input.currentPackageJson !== input.headPackageJson;
    const packageVersionChanged = currentPackageVersion !== headPackage.version;
    if (packageChanged && !packageVersionChanged) {
      issues.push("package.json changed but package/plugin version did not change");
    }

    const dependencyMetadataChanged = stableDependencyMetadata(currentPackage) !== stableDependencyMetadata(headPackage);
    const lockfileChanged = input.currentLockfile !== input.headLockfile;
    if (dependencyMetadataChanged && !lockfileChanged) {
      issues.push("dependency metadata changed but pnpm-lock.yaml did not change");
    }
  }

  if (input.headLockfile !== undefined && input.currentLockfile !== undefined && input.headPackageJson) {
    const headPackage = parsePackageJson(input.headPackageJson);
    const lockfileChanged = input.currentLockfile !== input.headLockfile;
    const packageVersionChanged = currentPackageVersion !== headPackage.version;
    if (lockfileChanged && !packageVersionChanged) {
      issues.push("pnpm-lock.yaml changed but package/plugin version did not change");
    }
  }

  return { ok: issues.length === 0, issues };
}
