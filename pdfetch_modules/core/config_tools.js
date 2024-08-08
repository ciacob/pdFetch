const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Returns the path of the user's home directory based on the current OS.
 * @return {String} The path to the user's home directory.
 */
function getUserHomeDirectory() {
  return os.homedir();
}

/**
 *
 * @returns Returns true if application currently runs on Windows.
 */
function isWindows() {
  return os.platform() === "win32";
}

/**
 * Retrieves and parses arguments, if any.
 * @param   {Array} dictionary
 *          Array of objects describing the arguments that are expected. Each object contains:
 *          - name: A print-friendly string (not used for parsing).
 *          - payload: A RegExp or string describing the argument pattern.
 *          - doc: Arbitrary documentation as a string.
 *          Examples:
 *            { name: 'Dry Run', payload: '--isDryRun', doc: 'A simple flag argument' }
 *            { name: 'Version', payload: /^--(version|v)/, doc: 'Prints app version' }
 *            { name: 'Home Directory', payload: /^--(homeDir)=(.+)/, doc: 'Sets app home' }
 *            {
 *              name: 'Parse Model',
 *              payload: /^--(parseModel)=(saasFile|raw)/,
 *              doc: 'Sets the parsing model to use; one of "saasFile" or "raw".'
 *            }
 *          IMPORTANT:
 *          (1) When using RegExp as payload, there must be at least one, and no more than two
 *              groups in the pattern; the first group must capture the argument name, and the
 *              second, if available, must capture the argument value.
 *          (2) If there is only one group, the value of the argument will be `true` (i.e., we
 *              will consider the argument to be a flag).
 *          (3) If a RegExp payload was used to specify both long and abridged names for an
 *              argument, e.g., /^--(version|v)/, only the long form of the argument will be
 *              used to represent the argument within the returned Object, regardless of the
 *              form used when executing the program.
 *
 * @param   {Object} defaults
 *          Optional. Object containing key-value pairs to populate the arguments repository
 *          with. These will function as defaults, in case no value will be found to overwrite
 *          them.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is: onMonitoringInfo
 *          ({type:"info|warn|error", message:"<any>"[, data : {}]});
 *
 * @return  {Object} Key-value pairs of provided or default arguments.
 *          Returns `null` for an unmatched argument, in which case the client code should
 *          stop execution.
 */
function getArguments(dictionary, defaults = {}, monitoringFn = null) {
  const $m = monitoringFn || function () {};
  const args = process.argv.slice(2);
  const argValues = { ...defaults };
  for (const arg of args) {
    if (!!arg) {
      let matched = false;
      for (const { payload } of dictionary) {
        if (typeof payload === "string") {
          if (arg === payload) {
            const key = arg.replace(/^\W*/, "");
            argValues[key] = true;
            matched = true;
            break;
          }
        } else if (payload instanceof RegExp) {
          const match = arg.match(payload);
          if (match) {
            let argName = match[1];
            const argNameSrc = payload.source;
            const argNames = argNameSrc.match(/\(([^\)]+)\)/)[1];
            if (argNames) {
              argName = argNames.split("|").shift();
            }
            argValues[argName] = match[2] || true;
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        $m({ type: "error", message: `Unknown argument: ${arg}` });
        return null;
      }
    }
  }
  return argValues;
}

/**
 * Generates a help string based on the dictionary of arguments.
 * @param {Array} dictionary
 *        Array of objects describing the arguments. Each object contains:
 *        - name: A print-friendly string
 *        - payload: A RegExp or string describing the argument pattern
 *        - doc: Arbitrary documentation as a string
 * @param {Function} [monitoringFn=null]
 *        Optional function to receive real-time monitoring information.
 *        Expected signature/arguments structure is: onMonitoringInfo
 *        ({type:"info|warn|error", message:"<any>"[, data : {}]});
 * @return {String} A formatted help string.
 */
function getHelp(dictionary, monitoringFn = null) {
  const $m = monitoringFn || function () {};

  const REGEX_ARG_NAME = /\(([^)]+)\)/;
  const REGEX_MULTI_ALIAS = /\(([^)]+)\)/g;

  let helpString = "";

  try {
    for (const { name, payload, doc } of dictionary) {
      let formattedPayload = "";
      let acceptedValues = "";

      if (typeof payload === "string") {
        formattedPayload = payload;
      } else if (payload instanceof RegExp) {
        const argNameSrc = payload.source;
        const argNamesMatch = argNameSrc.match(REGEX_ARG_NAME);
        if (argNamesMatch) {
          const argNames = argNamesMatch[1].split("|");
          formattedPayload = `--${argNames.join(" or --")}`;
          const matchGroups = argNameSrc.match(REGEX_MULTI_ALIAS);
          if (matchGroups.length > 1) {
            formattedPayload += "=...";
            const valueMatch = matchGroups[1].match(REGEX_ARG_NAME);
            if (valueMatch && valueMatch[1].includes("|")) {
              acceptedValues = `Accepted values: ${valueMatch[1].replace(
                /\|/g,
                ", "
              )}`;
            }
          }
        } else {
          formattedPayload = payload.toString();
        }
      } else {
        $m({
          type: "error",
          message: `Invalid payload type for argument: ${name}`,
        });
        continue;
      }

      helpString += `${formattedPayload}\nName: ${name}\nDetails: ${doc}\n`;
      if (acceptedValues) {
        helpString += `${acceptedValues}\n`;
      }
      helpString += `Form: ${payload}\n\n`;
    }
  } catch (error) {
    $m({
      type: "error",
      message: `Error generating help string. Details: ${error.message}`,
      data: { error },
    });
  }

  return helpString.trim();
}

/**
 * Reads a configuration file and returns the settings of the specified profile as a flat
 * object.
 *
 * @param   {String} filePath
 *          The path to the configuration file.
 *
 * @param   {String} profileName
 *          The name of the profile to extract.
 *
 * @param   {Function} monitoringFn
 *          A function to receive real-time monitoring information. Expected
 *          signature/arguments structure is: onMonitoringInfo
 *          ({type:"info|warn|error", message:"<any>"[, data : {}]});
 *
 * @return  {Object|null}
 *          The settings of the specified profile as a flat object, or null if no match.
 */
function getConfigData(filePath, profileName, monitoringFn) {
  const $m = monitoringFn || function () {};
  function invalidValueInfo(key, value, validOptions, profileName) {
    return `Ignoring unknown "${key}" for the "${profileName}" profile. Valid options: ${validOptions.join(
      ", "
    )}. Given: "${value}"`;
  }

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const configData = JSON.parse(fileContent);
    if (!configData.profiles || !Array.isArray(configData.profiles)) {
      $m({
        type: "error",
        message: `Invalid configuration structure in file: ${filePath}`,
      });
      return null;
    }
    const profile = configData.profiles.find((p) => p.name === profileName);
    if (!profile) {
      $m({
        type: profileName == "default" ? "debug" : "warn",
        message: `Profile "${profileName}" not found in configuration file: ${filePath}`,
      });
      return null;
    }
    const validStorageModes = [
      "files",
      "archived_files",
      "single_file",
      "single_archived_file",
    ];
    const validOperationModes = [
      "list",
      "list_changes",
      "list_files",
      "list_changes_files",
      "list_changes_files_delta",
    ];
    const settings = profile.settings || {};
    const result = {};

    // Iterate over the settings and filter/transform values
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === "string" && value.trim() === "") {
        $m({
          type: "debug",
          message: `Ignoring empty "${key}" of the "${profileName}" profile`,
        });
        result[key] = null;
      } else if (key === "storage_mode" && !validStorageModes.includes(value)) {
        $m({
          type: "warn",
          message: invalidValueInfo(key, value, validStorageModes, profileName),
        });
        result[key] = null;
      } else if (
        key === "operation_mode" &&
        !validOperationModes.includes(value)
      ) {
        $m({
          type: "warn",
          message: invalidValueInfo(
            key,
            value,
            validOperationModes,
            profileName
          ),
        });
        result[key] = null;
      } else {
        result[key] = value;
      }
    }
    return result;
  } catch (error) {
    const isFileMissing = error.code == "ENOENT";
    $m({
      type: isFileMissing ? "warn" : "error",
      message: `Error reading configuration file. Details: ${error.message}`,
      data: isFileMissing ? null : { error },
    });
    return null;
  }
}

/**
 * Merges three data sets, giving precedence to the later sets.
 * @param {Object} implicit - The implicit data set.
 * @param {Object} explicit - The explicit data set.
 * @param {Object} given - The given data set.
 * @return {Object} - The merged data set.
 */
function mergeData(implicit, explicit, given) {
  return { ...implicit, ...explicit, ...given };
}

module.exports = {
  getUserHomeDirectory,
  isWindows,
  getArguments,
  getHelp,
  getConfigData,
  mergeData,
};
