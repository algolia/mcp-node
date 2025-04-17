#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarnings
import readline from "readline";

let hasErrors = false;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const TS_ERROR_REGEX = /^(?<path>.+?)\((?<line>\d+),(?<column>\d+)\):[^:]+: (?<message>.+)$/;

rl.on("line", (line) => {
  const match = line.match(TS_ERROR_REGEX);
  if (!match) return;

  const { path, line: errorLine, column, message } = match.groups;
  hasErrors = true;
  console.log(`::error file=${path},line=${errorLine},col=${column}::${message}`);
});

rl.on("close", () => {
  process.exit(hasErrors ? 1 : 0);
});
