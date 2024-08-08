const path = require("path");
const fs = require("fs");
const { removeFolderContents } = require("../core/fs_tools");
const {
  getArticlesList,
  fetchArticles,
  getKBChanges,
} = require("../core/sn_tools");

/**
 * Removes the content of the workspace directory while keeping
 * the session file intact, if any.
 * @param   {String} folderPath
 *          Absolute path to a folder where downloaded PDFs and related files
 *          are to be placed.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is:
 *          onMonitoringInfo ({
 *              type:"info|warn|error",
 *              message:"<any>"[, data : {}]
 *          });
 */
async function resetWorkspace(folderPath, monitoringFn = null) {
  const $m = monitoringFn || function () {};
  try {
    await removeFolderContents(
      folderPath,
      ["PDFs", "*.json*", "*.pdf", "*.zip"],
      $m
    );
    $m({
      type: "info",
      message: `Workspace at "${folderPath}" has been reset.`,
    });
  } catch (error) {
    $m({
      type: "error",
      message: `Failed to reset workspace. Details: "${error.message}"`,
      data: { error },
    });
  }
}

/**
 * Resets the workspace and downloads a clean JSON list with the KB articles
 * available in ServiceNow.
 *
 * @param   {String} folderPath
 *          Absolute path to a folder where downloaded PDFs and related files
 *          are to be placed.
 *
 * @param   {String} targetFileName
 *          Name of a JSON file inside `folderPath` where the resulting list of
 *          articles is to be stored.
 *
 * @param   {String} instanceName
 *          Name of the ServiceNow instance to connect to, e.g., "acme" in "acme.
 *          service-now.com".
 *
 * @param   {String} userName
 *          Name of a local ITIL user to log in with.
 *
 * @param   {String} userPass
 *          Password to use when logging in.
 *
 * @param   {String} [filter=null]
 *          Optional ServiceNow encoded query to filter the results.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is:
 *          onMonitoringInfo ({
 *              type:"info|warn|error",
 *              message:"<any>"[, data : {}]
 *          });
 *
 * @returns {Promise<Array<Object>>}
 *          Promise resolving to an array of objects, each containing the KB
 *          article details.
 */
async function doListingOnly(
  folderPath,
  targetFileName,
  instanceName,
  userName,
  userPass,
  filter = null,
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};
  try {
    await resetWorkspace(folderPath, $m);
    const listFilePath = path.resolve(folderPath, `${targetFileName}.json`);
    const articles = await getArticlesList(
      instanceName,
      userName,
      userPass,
      listFilePath,
      filter,
      $m
    );
    $m({
      type: "info",
      message: `Articles list has been stored at "${listFilePath}".`,
    });
    return articles;
  } catch (error) {
    $m({
      type: "error",
      message: `Failed to list articles. Details: "${error.message}"`,
      data: { error },
    });
    throw error;
  }
}

/**
 * DOES NOT reset the workspace, and downloads a (new) JSON list with the
 * latest KB articles, also keeping the old one if available. Extracts the
 * changes between the two (e.g., what articles have been added, updated or
 * retired/deleted) and saves those to a JSON file as well.
 * @param   {String} folderPath
 *          Absolute path to a folder where downloaded PDFs and related files
 *          are to be placed.
 *
 * @param   {String} listFileName
 *          Name of a JSON file inside `folderPath` where resulting list of
 *          articles is stored.
 *
 * @param   {String} changesFileName
 *          Name of a JSON file inside `folderPath` where extracted changes
 *          are to be placed.
 * 
 * @param   {String} instanceName
 *          Name of ServiceNow instance to connect to, e.g., "acme" in "acme.
 *          service-now.com".
 * 
 * @param   {String} userName
 *          Name of a local ITIL user to log in with.
 * 
 * @param   {String} userPass
 *          Password to use when logging in.

 * @param   {String} [filter=null]
 *          Optional ServiceNow encoded query to filter the results.
 * 
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is:
 *          onMonitoringInfo ({
 *              type:"info|warn|error",
 *              message:"<any>"[, data : {}]
 *          });
 * 
 * @returns {Object} The content written to the `changesFileName`. This will
 *          be an Object resembling to the following:
 *          {
 *              "last_updated_on": "2024/07/09 14:52:03",
 *              "changes":  {
 *                   "removed": ["KB001234", "KB004567"],
 *                   "added": ["KB8888", "KB9999"],
 *                   "updated": ["KB74125", "KB89652"]
 *              }
 *          }
 *          Returns `null` in case no `listFileName` was found, because no 
 *          changes can be extracted in lack of an older articles list file to
 *          use as base for comparison.
 * 
 */
async function doListingWithChanges(
  folderPath,
  listFileName,
  changesFileName,
  instanceName,
  userName,
  userPass,
  filter = null,
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};

  try {
    const listFilePath = path.resolve(folderPath, `${listFileName}.json`);

    // Check if the list file exists
    if (!fs.existsSync(listFilePath)) {
      $m({
        type: "warn",
        message: `Cannot extract changes. File not found: "${listFilePath}". Try other "operation_mode" first.`,
      });
      return null;
    }

    // Rename the old list file
    const oldListFilePath = `${listFilePath}.old`;
    fs.renameSync(listFilePath, oldListFilePath);

    // Download a new articles list
    await getArticlesList(
      instanceName,
      userName,
      userPass,
      listFilePath,
      filter,
      $m
    );

    // Extract changes using the two lists
    const changesFilePath = path.resolve(folderPath, `${changesFileName}.json`);
    const changes = await getKBChanges(
      listFilePath,
      oldListFilePath,
      changesFilePath,
      $m
    );

    $m({
      type: "debug",
      message: `Changes extracted and saved to ${changesFilePath}.`,
      data: changes,
    });

    return changes;
  } catch (error) {
    $m({
      type: "error",
      message: `Error extracting changes. Details: ${error.message}`,
      data: { error },
    });
    return null;
  }
}

/**
 * Same as `doListingOnly`, except listed articles are actually downloaded
 * and exported to PDF format.
 * Note: Resulting files are placed under the "PDFs" subfolder of the given
 * `folderPath`.
 *
 * @param   {String} folderPath
 *          Absolute path to a folder where downloaded PDFs and related files
 *          are to be placed.
 *
 * @param   {String} targetFileName
 *          Name of a JSON file inside `folderPath` where resulting list of
 *          articles is to be stored.
 *
 * @param   {String} instanceName
 *          Name of ServiceNow instance to connect to, e.g., "acme" in "acme.
 *          service-now.com".
 *
 * @param   {String} userName
 *          Name of a local ITIL user to log in with.
 *
 * @param   {String} userPass
 *          Password to use when logging in.
 *
 * @param   {String} [filter=null]
 *          Optional ServiceNow encoded query to filter the results.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is:
 *          onMonitoringInfo ({
 *              type:"info|warn|error",
 *              message:"<any>"[, data : {}]
 *          });
 */
async function doListingWithFiles(
  folderPath,
  targetFileName,
  instanceName,
  userName,
  userPass,
  filter = null,
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};

  try {
    // Step 1: List articles
    const articlesList = await doListingOnly(
      folderPath,
      targetFileName,
      instanceName,
      userName,
      userPass,
      filter,
      $m
    );

    // Step 2: Prepare PDF home directory
    const pdfHome = path.join(folderPath, "PDFs");
    if (!fs.existsSync(pdfHome)) {
      fs.mkdirSync(pdfHome, { recursive: true });
      $m({ type: "debug", message: `PDFs directory created at ${pdfHome}.` });
    }

    // Step 3: Fetch articles as PDFs
    const articleNumbers = articlesList.map((listItem) => listItem.number);
    await fetchArticles(
      instanceName,
      userName,
      userPass,
      articleNumbers,
      pdfHome,
      false,
      $m
    );

    $m({
      type: "info",
      message: `Articles have been fetched and saved as PDFs in "${pdfHome}".`,
    });
  } catch (error) {
    $m({
      type: "error",
      message: `Error during doListingWithFiles. Details: ${error.message}`,
      data: { error },
    });
  }
}

/**
 * Same as `doListingWithChanges`, except it also acts upon an existing
 * collection of previously downloaded articles, by selectively deleting and
 * (re)downloading them in order to keep the collection up to date.
 *
 * Unlike `doListingWithChanges`, if no `listFileName` was found (meaning that
 * there was no earlier execution that has ever produced a list of articles),
 * then this function does not simply exit, but executes `doListingWithFiles`
 * first. That's because its ultimate goal is to provide an up to date
 * collection of articles in PDF format.
 *
 * NOTE, however, that this function does not ensure that the files in the
 * `PDFs` subfolder correctly match to the ones in the JSON list.
 *
 * @param   {String} folderPath
 *          Absolute path to a folder where downloaded PDFs and related files
 *          are to be placed.
 *
 * @param   {String} listFileName
 *          Name of a JSON file inside `folderPath` where resulting list of
 *          articles is stored.
 *
 * @param   {String} changesFileName
 *          Name of a JSON file inside `folderPath` where extracted changes
 *          are to be placed.
 *
 * @param   {String} instanceName
 *          Name of ServiceNow instance to connect to, e.g., "acme" in "acme.
 *          service-now.com".
 *
 * @param   {String} userName
 *          Name of a local ITIL user to log in with.
 *
 * @param   {String} userPass
 *          Password to use when logging in.
 *
 * @param   {String} [filter=null]
 *          Optional ServiceNow encoded query to filter the results.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is:
 *          onMonitoringInfo ({
 *              type:"info|warn|error",
 *              message:"<any>"[, data : {}]
 *          });
 *
 * @param   {Boolean} [newerOnly=false]
 *          Optional. If `true`, only articles that were added or updated
 *          since the previous call will be maintained in the `PDFs` subfolder.
 *          This is meant to meet a specific integration scenario, where the client code
 *          blindly consumes everything `pdFetch` downloads to its `PDFs` subfolder.
 *          This effectively means that folder will be empty most of the time,
 *          and only populate for a short period of time, between two subsequent
 *          calls, when articles get added and/or updated in ServiceNow. The client code
 *          can still respond to deletions on ServiceNow side by using information
 *          from the changes JSON file.
 */
async function doChangesWithFiles(
  folderPath,
  listFileName,
  changesFileName,
  instanceName,
  userName,
  userPass,
  filter = null,
  monitoringFn = null,
  newerOnly = false
) {
  const $m = monitoringFn || function () {};

  try {
    const listFilePath = path.resolve(folderPath, `${listFileName}.json`);

    // If the list file is missing, execute `doListingWithFiles` and then exit.
    if (!fs.existsSync(listFilePath)) {
      $m({
        type: "warn",
        message: `Cannot extract changes. File not found: "${listFilePath}". Will download articles then exit.`,
      });
      await doListingWithFiles(
        folderPath,
        listFileName,
        instanceName,
        userName,
        userPass,
        filter,
        $m
      );
      return;
    }

    // Execute `doListingWithChanges` and effect extracted changes.
    const changesReport = await doListingWithChanges(
      folderPath,
      listFileName,
      changesFileName,
      instanceName,
      userName,
      userPass,
      filter,
      $m
    );

    if (changesReport) {
      const pdfHome = path.join(folderPath, "PDFs");

      // Handle removals and updates by deleting current versions of the respective articles.
      if (!newerOnly) {
        const articlesToRemove = [].concat(
          changesReport.changes.removed || [],
          changesReport.changes.updated || []
        );

        if (articlesToRemove.length > 0) {
          const removals = articlesToRemove.map((articleNumber) =>
            path.join(pdfHome, `${articleNumber}.pdf`)
          );
          await removeFolderContents(folderPath, removals, $m);
        }
      }

      // Handle additions and updates by downloading (again) the respective articles.
      const articlesToDownload = [].concat(
        changesReport.changes.updated || [],
        changesReport.changes.added || []
      );

      if (articlesToDownload.length > 0) {
        await fetchArticles(
          instanceName,
          userName,
          userPass,
          articlesToDownload,
          pdfHome,
          newerOnly,
          $m
        );
      }

      $m({
        type: "info",
        message: `Changes applied and articles updated as needed.`,
        data: changesReport,
      });
    }
  } catch (error) {
    $m({
      type: "error",
      message: `Error applying changes and updating articles. Details: ${error.message}`,
      data: { error },
    });
  }
}

module.exports = {
  resetWorkspace,
  doListingOnly,
  doListingWithChanges,
  doListingWithFiles,
  doChangesWithFiles,
};
