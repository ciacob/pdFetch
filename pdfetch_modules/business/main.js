const fs = require("fs");
const path = require("path");
const {
  getArguments,
  getConfigData,
  mergeData,
  getHelp,
  getUserHomeDirectory,
} = require("../core/config_tools");
const {
  ensureSetup,
  archiveArticles,
  mergeArticles,
} = require("../core/fs_tools");
const {
  canOpenSession,
  openSession,
  closeSession,
} = require("../core/session");
const {
  doListingOnly,
  doListingWithChanges,
  doListingWithFiles,
  doChangesWithFiles,
} = require("./operation");

/**
 * Main entry point into program execution.
 *
 * @param   {Object} input
 *          Input data needed to execute the program.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *
 * @returns {Promise<Number>} Returns a Promise that resolves to `0` if program completed normally,
 *          `1` for expected early exits (e.g., the `--help` argument was given), or `2` if program
 *          exited because of an error.
 */
async function mainExec(input, monitoringFn = null) {
  return new Promise(async (resolve, reject) => {
    const $m = monitoringFn || function () {};

    // Extract input data
    const { configDefaults, configFileTemplate, appArgDefaults, appArgs } =
      input;

    // Parse command-line arguments
    const args = getArguments(appArgs, null, $m);
    if (!args) {
      $m({
        type: "error",
        message: `Failed reading program arguments. Run "${configDefaults.appName} --h" for documentation.`,
      });
      resolve(2); // Error exit
      return;
    }

    // Handle --help argument
    if (args.help) {
      $m({
        type: "info",
        message: `\n${configDefaults.appName} ${configDefaults.appVersion} by ${
          configDefaults.appAuthor
        }\n${configDefaults.appDescription}\n\nPROGRAM ARGUMENTS:\n\n${getHelp(
          appArgs,
          $m
        )}`,
      });
      resolve(1);
      return; // Early exit for help
    }

    // Handle --init_config argument
    if (args.init_config) {
      const configFilePath = path.join(
        getUserHomeDirectory(),
        "pdFetch.config"
      );
      ensureSetup(
        getUserHomeDirectory(),
        {
          content: [
            {
              type: "file",
              path: "pdFetch.config",
              template: configFileTemplate,
              data: configDefaults,
            },
          ],
        },
        $m
      );
      $m({
        type: "info",
        message: `Configuration file initialized at ${configFilePath}`,
      });
      resolve(1); // Early exit for config initialization
      return;
    }

    // Load default profile
    const configFilePath = path.join(getUserHomeDirectory(), "pdFetch.config");
    const defaultProfileData =
      getConfigData(configFilePath, "default", $m) || {};

    // Load specified profile if any
    const profileData = args.config_profile
      ? getConfigData(configFilePath, args.config_profile, $m) || {}
      : {};

    // Merge all data sources
    const finalInputData = mergeData(
      appArgDefaults,
      defaultProfileData,
      profileData,
      args
    );

    // Validate mandatory arguments
    for (const { payload, mandatory } of appArgs) {
      if (mandatory) {
        const argName = payload.source.match(/\(([^)]+)\)/)[1].split("|")[0];
        if (!finalInputData[argName]) {
          $m({
            type: "error",
            message: `Mandatory argument "${argName}" is missing.`,
          });
          resolve(2); // Error exit
          return;
        }
      }
    }

    // Ensure the output directory is valid
    if (!finalInputData.output_dir) {
      $m({ type: "error", message: "Output directory must be specified." });
      resolve(2); // Error exit
      return;
    }

    // Check if the output directory exists
    if (!fs.existsSync(finalInputData.output_dir)) {
      $m({
        type: "error",
        message: `Output directory "${finalInputData.output_dir}" does not exist.`,
      });
      resolve(2); // Error exit
      return;
    }

    // Check for session control
    if (!canOpenSession(finalInputData.output_dir)) {
      $m({
        type: "error",
        message: `A session is already open for the directory "${finalInputData.output_dir}".`,
      });
      resolve(2); // Error exit
      return;
    }

    openSession(finalInputData.output_dir);

    try {
      // Ensure the output directory structure
      ensureSetup(
        finalInputData.output_dir,
        {
          content: [
            {
              type: "folder",
              path: "PDFs",
            },
          ],
        },
        $m
      );

      // Execute the main business logic based on operation mode
      switch (finalInputData.operation_mode) {
        case "list":
          await doListingOnly(
            finalInputData.output_dir,
            "file_list",
            finalInputData.sn_instance_name,
            finalInputData.sn_user_name,
            finalInputData.sn_pass,
            finalInputData.sn_query,
            $m
          );
          break;
        case "list_changes":
          await doListingWithChanges(
            finalInputData.output_dir,
            "file_list",
            "file_changes",
            finalInputData.sn_instance_name,
            finalInputData.sn_user_name,
            finalInputData.sn_pass,
            finalInputData.sn_query,
            $m
          );
          break;
        case "list_files":
          await doListingWithFiles(
            finalInputData.output_dir,
            "file_list",
            finalInputData.sn_instance_name,
            finalInputData.sn_user_name,
            finalInputData.sn_pass,
            finalInputData.sn_query,
            $m
          );
          break;
        case "list_changes_files":
          await doChangesWithFiles(
            finalInputData.output_dir,
            "file_list",
            "file_changes",
            finalInputData.sn_instance_name,
            finalInputData.sn_user_name,
            finalInputData.sn_pass,
            finalInputData.sn_query,
            $m,
            finalInputData.newer_only
          );
          break;
        default:
          $m({
            type: "error",
            message: `Unknown operation mode: ${finalInputData.operation_mode}`,
          });
          resolve(2); // Error exit
          return;
      }

      // Handle storage mode
      const listFilePath = path.join(
        finalInputData.output_dir,
        "file_list.json"
      );
      if (fs.existsSync(listFilePath)) {
        const articleList = JSON.parse(fs.readFileSync(listFilePath));
        const articleNumbers = articleList.map((item) => item.number);

        // Retrieve current domain if not 'global' or empty/missing
        let domainName = "";
        if (
          articleList.length > 0 &&
          articleList[0].sys_domain &&
          articleList[0].sys_domain.display_value
        ) {
          const domainValue = articleList[0].sys_domain.display_value.trim();
          if (domainValue && domainValue.toLowerCase() !== "global") {
            const domainParts = domainValue.split("/");
            domainName = domainParts[domainParts.length - 1].toLowerCase();
          }
        }

        const fileNameBase = domainName
          ? `${finalInputData.sn_instance_name}_${domainName}`
          : finalInputData.sn_instance_name;

        switch (finalInputData.storage_mode) {
          case "archived_files":
            await archiveArticles(
              finalInputData.output_dir,
              articleNumbers,
              fileNameBase,
              $m
            );
            break;
          case "single_file":
            await mergeArticles(
              finalInputData.output_dir,
              articleNumbers,
              fileNameBase,
              $m
            );
            break;
        }
      }
    } catch (error) {
      $m({
        type: "error",
        message: `Execution failed. Details: ${error.message}`,
        data: { error },
      });
      resolve(2); // Error exit
    } finally {
      closeSession(finalInputData.output_dir);
    }

    resolve(0); // Normal exit
  });
}

module.exports = { mainExec };
