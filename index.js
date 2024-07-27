const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

/**
 * Removes all contents of a specified folder without deleting the folder itself.
 *
 * @param   {string} folderPath
 *          The path to the folder whose contents should be removed.
 *
 * @param   {Function} monitoringFn
 *          Optional, default `null`. A function to be sent monitoring information to, in
 *          real-time, as KB articles are being fetched. Expected signature/arguments structure is:
 *          onMonitoringInfo ({type:"info|warn|error", message:"<any>"[, data : {}]});
 *
 * @returns {Promise<void>} - A promise that resolves when the folder contents have been removed.
 */
async function removeFolderContents(folderPath, monitoringFn = null) {
  $m = monitoringFn || function () {};
  try {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = await fs.lstat(filePath);

      if (stat.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
    }

    $m({
      type: "info",
      message: `Folder "${folderPath}" has been cleared.`,
    });
  } catch (error) {
    $m({
      type: "error",
      message: `Error clearing folder "${folderPath}". Details: ${error}`,
    });
  }
}

/**
 * Low-level function that logs onto a ServiceNow instance, navigates to given KB articles
 * within that instance, and downloads them as PDFs.
 *
 * IMPORTANT: this is a low-level function. It is expected that the data it receives as
 * arguments has been validated outside it.
 *
 * @param   {String} instanceName
 *          Name of ServiceNow instance to connect to, e.g., "acme" in "acme.service-now.com".
 *
 * @param   {String} userName
 *          Name of a local itil user to log in with.
 *
 * @param   {String} userPass
 *          Password to use when logging it.
 *
 * @param   {String[]} articleNumbers
 *          Array of strings representing ServiceNow Knowledge article numbers, e.g.,
 *          ['KB0010279', 'KB0010280', 'KB0010281']. IMPORTANT: these are assumed as valid
 *          and accessible by the given `userName`.
 *
 * @param   {String} targetDir
 *          Absolute path to a folder where downloaded PDFs are to be placed. IMPORTANT: it is
 *          assumed that the user or process executing the pdFetch application has the needed
 *          credentials for writing to that folder.
 *
 * @param   {Boolean} resetTarget
 *          Optional, default `false`. Whether to delete all the files within the `targetDir`
 *          folder before writing new ones.
 *
 * @param   {Function} monitoringFn
 *          Optional, default `null`. Function to be sent monitoring information to, in
 *          real-time, as KB articles are being fetched. Expected signature/arguments structure is:
 *          onMonitoringInfo ({type:"info|warn|error", message:"<any>"[, data : {}]});
 */
async function fetchArticles(
  instanceName,
  userName,
  userPass,
  articleNumbers,
  targetDir,
  resetTarget = false,
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};

  $m({ type: "info", message: "Opening headless browser..." });
  const browser = await puppeteer.launch({ headless: "shell" });
  const page = await browser.newPage();

  $m({ type: "info", message: "Logging in..." });
  await page.goto(`https://${instanceName}.service-now.com/login.do`, {
    waitUntil: "networkidle2",
  });
  await page.type("#user_name", userName);
  await page.type("#user_password", userPass);
  await page.click("#sysverb_login");
  await page.waitForNavigation({ waitUntil: "networkidle2" });

  if (resetTarget) {
    removeFolderContents(targetDir, $m);
  }

  for (const articleNumber of articleNumbers) {
    try {
      $m({
        type: "info",
        message: `Downloading KB article ${articleNumber}...`,
      });
      await page.goto(
        `https://${instanceName}.service-now.com/kb_view.do?sysparm_article=${articleNumber}&sysparm_media=print`,
        { waitUntil: "networkidle2" }
      );
      const pdfPath = path.join(targetDir, `${articleNumber}.pdf`);

      // PAGE ADJUSTMENTS
      // 1. Ensure all `<details>` HTML tags within the page about to be printed will stay open, so that their
      // disclosed content will be printed as well.
      const numDetailsTags = await page.evaluate(() => {
        const allDetailsTags = document.querySelectorAll("details");
        allDetailsTags.forEach((detail) => {
          detail.open = true;
        });
        return allDetailsTags.length;
      });
      if (numDetailsTags) {
        $m({
          type: "info",
          message: `Found and expanded ${numDetailsTags} "<details>" HTML tag(s) for print.`,
        });
      }

      // 2. Remove unwanted elements on the page. These are standard ServiceNow element in the KB pages,
      // and we expect to find them in whatever instances we connect to.
      await page.evaluate(() => {
        const selectorsToRemove = [
          "#versionNumber",
          "#articleStarRatingGroup",
          ".kb-article-view-count",
          ".snc-article-header-author",
        ];
        for (const selector of selectorsToRemove) {
          const element = document.querySelector(selector);
          if (element) {
            element.remove();
          }
        }
      });

      await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
      $m({
        type: "info",
        message: `Done. Successfully downloaded ${articleNumber}.`,
      });
    } catch (error) {
      $m({
        type: "error",
        message: `Failed to download ${articleNumber}: ${error.message}`,
        data: { error },
      });
    }
  }

  await browser.close();
  $m({
    type: "info",
    message: `All done. Fetched ${articleNumbers.length} article(s).`,
  });
}

/**
 * Function to retrieve a list of currently active KB articles from a ServiceNow instance.
 *
 * @param   {String} instanceName
 *          Name of ServiceNow instance to connect to, e.g., "acme" in "acme.service-now.com".
 *
 * @param   {String} userName
 *          Name of a local ITIL user to log in with.
 *
 * @param   {String} userPass
 *          Password to use when logging in.
 *
 * @param   {String} targetFile
 *          Absolute path to a JSON file where resulting list of articles is to be stored.
 *          IMPORTANT: it is assumed that the user or process executing the pdFetch application
 *          has the needed credentials for writing to that file.
 *
 * @param   {String} [filter=null]
 *          Optional ServiceNow encoded query to filter the results.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *
 * @returns {Promise<Array<Object>>}
 *          Promise resolving to an array of objects, each containing the KB article details.
 */
async function getArticlesList(
  instanceName,
  userName,
  userPass,
  targetFile,
  filter = null,
  monitoringFn = null
) {
  // Ensure defaults for optional arguments.
  filter = (filter || "").trim();
  const $m = monitoringFn || function () {};

  // Prepare the call to the Table API o the target ServiceNow instance.
  const url = `https://${instanceName}.service-now.com/api/now/table/kb_knowledge`;
  const auth = {
    username: userName,
    password: userPass,
  };
  const query = `workflow_state=published${filter ? "^" + filter : ""}`;
  const params = {
    sysparm_query: query,
    sysparm_display_value: true,
    sysparm_fields:
      "sys_id,number,short_description,version,sys_updated_on,sys_domain,kb_knowledge_base",
  };

  // Call the API.
  $m({
    type: "info",
    message: `Listing articles from "${instanceName}.service-now" that match query: "${query}"...`,
  });
  try {
    const response = await axios.get(url, { auth, params });
    $m({
      type: "info",
      message: `Got response from "${instanceName}.service-now".`,
    });

    // Loop through received articles and pack them as an Array of Objects. Refine raw data as needed.
    const articles = response.data.result.map((article) => {
      $m({
        type: "info",
        message: `Processing article "${article.number} v${article.version.display_value} - ${article.short_description}"...`,
      });
      const updatedAt = new Date(article.sys_updated_on).getTime();
      return {
        sys_id: article.sys_id,
        number: article.number,
        version: article.version,
        short_description: article.short_description,
        kb_knowledge_base: article.kb_knowledge_base,
        sys_domain: article.sys_domain,
        sys_updated_on: article.sys_updated_on,
        sys_updated_on_msecs: updatedAt,
      };
    });
    $m({
      type: "info",
      message: `All done. Processed ${articles.length} article(s).`,
    });
    try {
      await fs.writeFile(targetFile, JSON.stringify(articles, null, "\t"));
      $m({
        type: "info",
        message: `Successfully wrote file "${targetFile}".`,
      });
    } catch (err) {
      $m({
        type: "error",
        message: `Error writing file "${targetFile}".`,
      });
    }

    return articles;
  } catch (error) {
    // Handle errors in calling the API, if any.
    $m({
      type: "error",
      message: `Error listing articles from "${instanceName}.service-now". Details: ${error.message}`,
      data: { error },
    });
  }
}

module.exports = { getArticlesList, fetchArticles };

// TESTS:
// GET a sample of all the Goodman articles as local PDF files.
const monitoringFn = (info) => {
  console.log(`[${info.type.toUpperCase()}] ${info.message}`, info.data || "");
};
const targetFolder = "c:\\Users\\claud\\_pdFetch_playground\\";
const targetFile = path.join(targetFolder, "kb_list.json");

(async function test() {
  // 1. Clear the target folder.
  await removeFolderContents(targetFolder, monitoringFn);

  // 2. Get the list of articles
  const articles = await getArticlesList(
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    targetFile,
    "sys_domain=292970ec978fe91041f8b38fe153af32",
    monitoringFn
  );

  // 3. Download the articles as PDFs.
  const articleNames = articles.map((article) => article.number);
  articleNames.length = 25;
  console.log("SAMPLE of articles is: ", articleNames);
  await fetchArticles(
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    articleNames,
    targetFolder,
    false,
    monitoringFn
  );
})();
