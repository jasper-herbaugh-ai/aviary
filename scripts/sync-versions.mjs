#!/usr/bin/env bun

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const ROOT_PACKAGE_PATH = path.join(ROOT_DIR, "package.json");
const VERSION_PATH = path.join(ROOT_DIR, "VERSION");
const WORKFLOWS_DIR = path.join(ROOT_DIR, ".github/workflows");

const PACKAGE_JSON_PATHS = [ROOT_PACKAGE_PATH];
const WORKSPACE_DIRS = ["apps", "packages"];

const RAW_ARGS = process.argv.slice(2);
const CHECK_MODE = RAW_ARGS.includes("--check");
const HELP_MODE = RAW_ARGS.includes("--help") || RAW_ARGS.includes("-h");
const VERSION_FROM_CLI = RAW_ARGS.find((value) => !value.startsWith("--")) || null;
const VALID_PATTERNS = [
  'echo "version=$(cat VERSION)" >> $GITHUB_OUTPUT',
  "Extract version from VERSION",
];
const OLD_PATTERN = 'echo "version=$(jq -r .version package.json)" >> $GITHUB_OUTPUT';

const HELP_TEXT = "Usage: bun run scripts/sync-versions.mjs [--check] [<version>]";

function validateVersion(value) {
  return /^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(value);
}

async function readVersionFromFile(filePath) {
  try {
    const version = (await fs.readFile(filePath, "utf8")).trim();
    return version;
  } catch {
    return null;
  }
}

async function writeText(filePath, value) {
  await fs.writeFile(filePath, `${value}\n`, "utf8");
}

async function collectPackageJsonPaths() {
  const paths = [...PACKAGE_JSON_PATHS];

  for (const workspaceDir of WORKSPACE_DIRS) {
    const dirPath = path.join(ROOT_DIR, workspaceDir);
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      paths.push(path.join(dirPath, entry.name, "package.json"));
    }
  }

  const existingPaths = [];
  for (const packagePath of paths) {
    try {
      await fs.access(packagePath);
      existingPaths.push(packagePath);
    } catch {}
  }

  return existingPaths;
}

async function loadPackageVersions() {
  const packagePaths = await collectPackageJsonPaths();
  const versions = [];

  for (const packagePath of packagePaths) {
    const raw = await fs.readFile(packagePath, "utf8");
    const json = JSON.parse(raw);
    versions.push({ path: packagePath, version: json.version || null });
  }

  return versions;
}

async function syncPackageVersions(version) {
  const packagePaths = await collectPackageJsonPaths();
  const updates = [];

  for (const packagePath of packagePaths) {
    const raw = await fs.readFile(packagePath, "utf8");
    const json = JSON.parse(raw);

    if (json.version === version) {
      continue;
    }

    json.version = version;
    updates.push(packagePath);
    await fs.writeFile(packagePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  }

  return updates;
}

function replaceWorkflowVersionSource(content) {
  return content
    .replaceAll('echo "version=$(jq -r .version package.json)" >> $GITHUB_OUTPUT', 'echo "version=$(cat VERSION)" >> $GITHUB_OUTPUT')
    .replaceAll("Extract version from package.json", "Extract version from VERSION");
}

async function syncWorkflows(version) {
  const updates = [];
  const files = await fs.readdir(WORKFLOWS_DIR, { withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".yml") && !file.name.endsWith(".yaml")) {
      continue;
    }

    const filePath = path.join(WORKFLOWS_DIR, file.name);
    const current = await fs.readFile(filePath, "utf8");
    const replacement = replaceWorkflowVersionSource(current);

    if (replacement !== current) {
      await writeText(filePath, replacement);
      updates.push(filePath);
    }
  }

  return updates;
}

async function checkWorkflowsSync() {
  const problems = [];
  const files = await fs.readdir(WORKFLOWS_DIR, { withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".yml") && !file.name.endsWith(".yaml")) {
      continue;
    }

    const filePath = path.join(WORKFLOWS_DIR, file.name);
    const current = await fs.readFile(filePath, "utf8");
    if (current.includes(OLD_PATTERN)) {
      problems.push({
        path: filePath,
        reason: `workflow still reads version from package.json via jq`,
      });
      continue;
    }

    const hasCurrent = VALID_PATTERNS.some((pattern) => current.includes(pattern));
    const hasOld = current.includes(OLD_PATTERN);
    if (hasOld && !hasCurrent) {
      problems.push({
        path: filePath,
        reason: `workflow references package.json version extraction via jq`,
      });
    }
  }

  return problems;
}

async function checkPackageSync(version) {
  const packageVersions = await loadPackageVersions();
  const problems = [];

  for (const pkg of packageVersions) {
    if (pkg.version !== version) {
      problems.push({
        path: pkg.path,
        expected: version,
        actual: pkg.version,
      });
    }
  }

  const fileVersion = await readVersionFromFile(VERSION_PATH);
  if (!fileVersion) {
    problems.push({
      path: VERSION_PATH,
      reason: "VERSION file is missing",
    });
  } else if (fileVersion !== version) {
    problems.push({
      path: VERSION_PATH,
      reason: `VERSION file is ${fileVersion}, expected ${version}`,
      expected: version,
      actual: fileVersion,
    });
  }

  const rawRoot = await fs.readFile(ROOT_PACKAGE_PATH, "utf8");
  const rootPackage = JSON.parse(rawRoot);
  if (rootPackage.version !== version) {
    problems.push({
      path: ROOT_PACKAGE_PATH,
      reason: `root package version is ${rootPackage.version}, expected ${version}`,
      expected: version,
      actual: rootPackage.version,
    });
  }

  return { packageVersions, problems };
}

function usage() {
  console.log(HELP_TEXT);
  process.exit(0);
}

(async () => {
  if (HELP_MODE) {
    usage();
  }

  let version = VERSION_FROM_CLI;
  if (version && !validateVersion(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  if (!version) {
    const fileVersion = await readVersionFromFile(VERSION_PATH);
    if (fileVersion) {
      version = fileVersion;
    } else {
      const raw = await fs.readFile(ROOT_PACKAGE_PATH, "utf8");
      const rootPackage = JSON.parse(raw);
      version = rootPackage.version;
      if (!version) {
        throw new Error("Could not determine version from root package.json");
      }
      if (!validateVersion(version)) {
        throw new Error(`Invalid version in package.json: ${version}`);
      }
    }
  }

  if (CHECK_MODE) {
    const { packageVersions, problems } = await checkPackageSync(version);
    const workflowProblems = await checkWorkflowsSync();
    const allProblems = [
      ...problems,
      ...workflowProblems,
    ];

    if (allProblems.length > 0) {
      console.error("Version check failed. Mismatches found:");
      for (const problem of allProblems) {
        if (problem.reason) {
          console.error(`- ${path.relative(ROOT_DIR, problem.path)}: ${problem.reason}`);
        } else {
          const short = path.relative(ROOT_DIR, problem.path);
          console.error(`- ${short}: expected ${problem.expected}, found ${problem.actual}`);
        }
      }
      console.error(`\nRun: bun run sync-version ${version} to fix.`);
      process.exit(1);
    }

    console.log(`Version check passed for ${packageVersions.length} package.json files and ${VERSION_PATH}.`);
    return;
  }

  await writeText(VERSION_PATH, version);
  const packageUpdates = await syncPackageVersions(version);
  const workflowUpdates = await syncWorkflows(version);

  console.log(`VERSION synchronized to ${version}`);
  if (packageUpdates.length > 0) {
    console.log(`Updated package.json files:`);
    for (const file of packageUpdates) {
      console.log(`- ${path.relative(ROOT_DIR, file)}`);
    }
  } else {
    console.log("No package.json version changes needed.");
  }

  if (workflowUpdates.length > 0) {
    console.log(`Updated workflow files:`);
    for (const file of workflowUpdates) {
      console.log(`- ${path.relative(ROOT_DIR, file)}`);
    }
  } else {
    console.log("No workflow version source changes needed.");
  }
})( );
