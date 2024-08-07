const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Define the lock file name as a module-level constant
const LOCK_FILE_NAME = "operation_in_progress.lock";

/**
 * Checks if a session can be opened in the target folder.
 * @param {String} targetFolder - The path to the target folder.
 * @return {Boolean} - Returns true if the session can be opened, false otherwise.
 */
function canOpenSession(targetFolder) {
  const lockFilePath = path.join(targetFolder, LOCK_FILE_NAME);
  return !fs.existsSync(lockFilePath);
}

/**
 * Opens a session in the target folder by creating a lock file.
 * @param {String} targetFolder - The path to the target folder.
 * @param {Function} [monitoringFn=null] - Optional function to receive real-time monitoring information.
 */
function openSession(targetFolder, monitoringFn = null) {
  const $m = monitoringFn || function () {};
  const lockFilePath = path.join(targetFolder, LOCK_FILE_NAME);

  if (fs.existsSync(lockFilePath)) {
    $m({
      type: "error",
      message: `Cannot open session: Lock file already exists in ${targetFolder}.`,
    });
    throw new Error(
      `Cannot open session: Lock file already exists in ${targetFolder}.`
    );
  }

  const lockFileContent = uuidv4();
  fs.writeFileSync(lockFilePath, lockFileContent, "utf8");
  $m({ type: "info", message: `Session opened in ${targetFolder}.` });
}

/**
 * Closes a session in the target folder by deleting the lock file.
 * @param {String} targetFolder - The path to the target folder.
 * @param {Function} [monitoringFn=null] - Optional function to receive real-time monitoring information.
 */
function closeSession(targetFolder, monitoringFn = null) {
  const $m = monitoringFn || function () {};
  const lockFilePath = path.join(targetFolder, LOCK_FILE_NAME);

  if (!fs.existsSync(lockFilePath)) {
    $m({
      type: "warn",
      message: `No lock file found in ${targetFolder}. Nothing to close.`,
    });
    return;
  }

  fs.unlinkSync(lockFilePath);
  $m({ type: "info", message: `Session closed in ${targetFolder}.` });
}

module.exports = {
  canOpenSession,
  openSession,
  closeSession,
};
