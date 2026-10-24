import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const configuredEnvDirectory =
  process.env.VIPERWOLF_ENV_DIRECTORY ?? path.dirname(projectDirectory);
const dockerEnvPath = path.join(projectDirectory, ".env.docker");
const composePath = path.join(projectDirectory, "compose.yaml");
const action = process.argv[2];

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function pathForWsl(targetPath) {
  const absolutePath = path.resolve(targetPath);
  const match = absolutePath.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) {
    fail(`Cannot map the project path into WSL: ${absolutePath}`);
  }
  const drive = match[1].toLowerCase();
  const rest = match[2].replaceAll("\\", "/");
  return `/mnt/${drive}/${rest}`;
}

function quoteEnvValue(value) {
  if (/[\r\n]/.test(value)) {
    fail("Database credentials must not contain line breaks.");
  }
  return `'${value.replaceAll("'", "\\'")}'`;
}

function prepareDatabaseEnv() {
  loadEnvConfig(configuredEnvDirectory, true);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    fail(
      `DATABASE_URL is missing. Configure the app environment in ${configuredEnvDirectory}.`,
    );
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    fail("DATABASE_URL is not a valid PostgreSQL connection URL.");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    fail("DATABASE_URL must use PostgreSQL.");
  }

  const username = decodeURIComponent(databaseUrl.username);
  const password = decodeURIComponent(databaseUrl.password);
  const databaseName = decodeURIComponent(
    databaseUrl.pathname.replace(/^\/+/, ""),
  );

  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(username)) {
    fail("The PostgreSQL username must contain only letters, numbers, and underscores.");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(databaseName)) {
    fail("The PostgreSQL database name must contain only letters, numbers, and underscores.");
  }
  if (!password) {
    fail("DATABASE_URL must contain a PostgreSQL password.");
  }

  const dockerEnv = [
    `POSTGRES_USER=${quoteEnvValue(username)}`,
    `POSTGRES_PASSWORD=${quoteEnvValue(password)}`,
    `POSTGRES_DB=${quoteEnvValue(databaseName)}`,
    "",
  ].join("\n");

  writeFileSync(dockerEnvPath, dockerEnv, { encoding: "utf8", mode: 0o600 });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.error) {
    fail(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} exited with code ${result.status ?? result.signal}.`, result.status ?? 1);
  }
}

function composeArguments() {
  const composeOptions = [
    "compose",
    "--project-name",
    "viperwolf",
    "--project-directory",
    projectDirectory,
    "--env-file",
    dockerEnvPath,
    "--file",
    composePath,
  ];

  if (process.platform !== "win32") {
    return { command: "docker", args: composeOptions };
  }

  const windowsDocker = spawnSync("docker", ["compose", "version"], {
    cwd: projectDirectory,
    stdio: "ignore",
    env: process.env,
  });
  if (!windowsDocker.error && windowsDocker.status === 0) {
    return { command: "docker", args: composeOptions };
  }

  const wslOptions = [
    "--distribution",
    process.env.VIPERWOLF_WSL_DISTRIBUTION ?? "Ubuntu",
    "--user",
    "root",
    "--exec",
    "docker",
    "compose",
    "--project-name",
    "viperwolf",
    "--project-directory",
    pathForWsl(projectDirectory),
    "--env-file",
    pathForWsl(dockerEnvPath),
    "--file",
    pathForWsl(composePath),
  ];
  return { command: "wsl.exe", args: wslOptions };
}

function runPrisma(...args) {
  const prismaCli = path.join(
    projectDirectory,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  if (!existsSync(prismaCli)) {
    fail("Prisma is not installed. Run npm ci before setting up the database.");
  }
  run(process.execPath, [prismaCli, ...args]);
}

if (!["setup", "up", "down", "status"].includes(action)) {
  fail("Usage: node scripts/db-container.mjs <setup|up|down|status>", 2);
}

if (!existsSync(composePath)) {
  fail("compose.yaml is missing from the project directory.");
}

prepareDatabaseEnv();
const compose = composeArguments();

if (action === "setup") {
  run(compose.command, [...compose.args, "up", "--detach", "--wait"]);
  runPrisma("migrate", "deploy");
  run(process.execPath, [path.join(projectDirectory, "prisma", "seed.mjs")]);
  console.log("PostgreSQL is healthy; migrations and the structural event seed are ready.");
} else if (action === "up") {
  run(compose.command, [...compose.args, "up", "--detach", "--wait"]);
  console.log("PostgreSQL container is healthy.");
} else if (action === "down") {
  run(compose.command, [...compose.args, "down"]);
  console.log("PostgreSQL container stopped. Its named data volume was preserved.");
} else {
  run(compose.command, [...compose.args, "ps"]);
}
