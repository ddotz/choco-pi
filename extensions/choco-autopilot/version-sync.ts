export interface VersionSyncInput {
  currentPackageJson: string;
  headPackageJson?: string;
  currentLockfile?: string;
  headLockfile?: string;
  currentPluginVersion: string;
  currentReadme?: string;
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

function readmePackageVersion(readme: string): string | undefined {
  return readme.match(/Current package version:\s*`([^`]+)`/)?.[1];
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

  if (input.currentReadme !== undefined && currentPackageVersion) {
    const currentReadmeVersion = readmePackageVersion(input.currentReadme);
    if (!currentReadmeVersion) {
      issues.push("README current package version line is missing");
    } else if (currentReadmeVersion !== currentPackageVersion) {
      issues.push("README current package version does not match package.json version");
    }
  }

  if (input.headPackageJson) {
    const headPackage = parsePackageJson(input.headPackageJson);
    const dependencyMetadataChanged = stableDependencyMetadata(currentPackage) !== stableDependencyMetadata(headPackage);
    const lockfileChanged = input.currentLockfile !== input.headLockfile;
    if (dependencyMetadataChanged && !lockfileChanged) {
      issues.push("dependency metadata changed but pnpm-lock.yaml did not change");
    }
  }

  return { ok: issues.length === 0, issues };
}
