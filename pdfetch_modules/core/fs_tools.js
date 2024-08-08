const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const glob = require("glob");
const archiver = require("archiver");
const { PDFDocument } = require("pdf-lib");

/**
 * Removes content of a specified folder without deleting the folder itself.
 *
 * @param   {string} folderPath
 *          The path to the folder whose contents should be removed.
 *
 * @param   {string[]} [patterns=[]]
 *          An array of strings representing file or folder patterns to match for deletion.
 *          Supports wildcards (* for any characters, ? for one character). Empty strings
 *          will be ignored. If the array is null or empty, all contents will be deleted.
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is:
 *          onMonitoringInfo ({type:"info|warn|error", message:"<any>"[, data : {}]});
 *
 * @returns {Promise<void>} - A promise that resolves when the folder contents have been
 *          removed.
 */
async function removeFolderContents(
  folderPath,
  patterns = [],
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};

  try {
    const files = await fsp.readdir(folderPath);

    // Prepare a set of files to delete based on patterns
    const filesToDelete = new Set();

    // If patterns are provided, match files against patterns
    if (patterns && patterns.length > 0) {
      for (const pattern of patterns.filter(Boolean)) {
        const matches = glob.sync(pattern, { cwd: folderPath });
        for (const match of matches) {
          filesToDelete.add(match);
        }
      }
    } else {
      // If no patterns are provided, delete everything
      files.forEach((file) => filesToDelete.add(file));
    }

    // Delete matched files and folders
    for (const file of filesToDelete) {
      const filePath = path.join(folderPath, file);
      const stat = await fsp.lstat(filePath);

      if (stat.isDirectory()) {
        await fsp.rm(filePath, { recursive: true, force: true });
      } else {
        await fsp.unlink(filePath);
      }

      $m({
        type: "debug",
        message: `Deleted: "${filePath}"`,
      });
    }

    $m({
      type: "debug",
      message: `Done clearing (matching) content of folder "${folderPath}".`,
    });
  } catch (error) {
    $m({
      type: "error",
      message: `Error clearing folder "${folderPath}". Details: ${error.message}`,
      data: { error },
    });
  }
}

/**
 * Function to archive ServiceNow articles as PDF files into a ZIP archive.
 *
 * @param   {String} workDir
 *          The absolute path to the working directory where PDF files are located.
 *
 * @param   {String[]} articleNumbers
 *          An array of strings representing KB article numbers. These will be resolved to PDF files in the format "<workDir>/PDFs/<articleNumber>.pdf".
 *
 * @param   {String} archiveName
 *          The name of the resulting ZIP archive. It will be saved at "<workDir>/<archiveName>.zip".
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is: onMonitoringInfo ({type:"info|warn|error", message:"<any>"[, data : {}]});
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the archive has been created.
 */
async function archiveArticles(
  workDir,
  articleNumbers,
  archiveName,
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};

  return new Promise((resolve, reject) => {
    const outputPath = path.join(workDir, `${archiveName}.zip`);
    const pdfDir = path.join(workDir, "PDFs");

    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      $m({
        type: "info",
        message: `Archive "${outputPath}" has been finalized. Total bytes: ${archive.pointer()}`,
      });
      resolve();
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        $m({ type: "warn", message: `Warning: ${err.message}` });
      } else {
        $m({ type: "error", message: `Error: ${err.message}`, data: { err } });
        reject(err);
      }
    });

    archive.on("error", (err) => {
      $m({ type: "error", message: `Error: ${err.message}`, data: { err } });
      reject(err);
    });

    archive.pipe(output);

    // Append files incrementally
    articleNumbers.forEach((articleNumber) => {
      const filePath = path.join(pdfDir, `${articleNumber}.pdf`);
      archive.file(filePath, { name: `${articleNumber}.pdf` });
      $m({
        type: "info",
        message: `Adding file "${articleNumber}.pdf" to archive...`,
      });
    });

    archive.finalize();
  });
}

/**
 * Function to merge ServiceNow articles exported as PDF files into a single PDF file.
 *
 * @param   {String} workDir
 *          The absolute path to the working directory where PDF files are located.
 *
 * @param   {String[]} articleNumbers
 *          An array of strings representing KB article numbers. These will be resolved to
 *          PDF files in the format "<workDir>/PDFs/<articleNumber>.pdf".
 *
 * @param   {String} mergedFileName
 *          The name of the resulting merged PDF file. It will be saved at
 *          "<workDir>/<mergedFileName>.pdf".
 *
 * @param   {Function} [monitoringFn=null]
 *          Optional function to receive real-time monitoring information.
 *          Expected signature/arguments structure is: onMonitoringInfo
 *          ({type:"info|warn|error", message:"<any>"[, data : {}]});
 *
 * @returns {Promise<void>}
 *          A promise that resolves when the merged PDF has been created.
 */
async function mergeArticles(
  workDir,
  articleNumbers,
  mergedFileName,
  monitoringFn = null
) {
  const $m = monitoringFn || function () {};

  try {
    const mergedPdf = await PDFDocument.create();
    const pdfDir = path.join(workDir, "PDFs");
    const outputPath = path.join(workDir, `${mergedFileName}.pdf`);

    let addedFiles = 0;
    for (const articleNumber of articleNumbers) {
      const filePath = path.join(pdfDir, `${articleNumber}.pdf`);
      if (!fs.existsSync(filePath)) {
        $m({ type: "warn", message: `Skipped missing file: ${filePath}.` });
        continue;
      }

      $m({
        type: "info",
        message: `Adding file "${articleNumber}.pdf" to merged PDF...`,
      });

      const pdfBytes = await fs.promises.readFile(filePath);
      const pdf = await PDFDocument.load(pdfBytes);

      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      addedFiles++;
    }

    if (addedFiles > 0) {
      const mergedPdfBytes = await mergedPdf.save();
      await fs.promises.writeFile(outputPath, mergedPdfBytes);

      $m({
        type: "info",
        message: `Merged ${addedFiles} PDF(s) to file "${outputPath}"`,
      });
    } else {
      $m({
        type: "warn",
        message: `Found no actual PDFs to merge. Check your "operation_mode".`,
      });
    }
  } catch (error) {
    $m({
      type: "error",
      message: `Error merging PDFs. Details: ${error.message}`,
      data: { error },
    });
  }
}

/**
 * Ensures a specific folder structure exists and populates it with files based on templates.
 * @param {String} homeDir
 *        An absolute path to the base directory.
 *
 * @param {Object} bluePrint
 *        A blueprint object describing the structure and content, such as:
 *        {
 *          content: [
 *            { type: "folder", path: "/path/to/my/folder" },
 *            {
 *              type: "file",
 *              path: "/path/to/my/folder/my_file.txt",
 *              template: "Hello world! My name is {{firstName}} {{lastName}}.",
 *              data: { firstName: "John", lastName: "Doe" },
 *            },
 *            { type: "folder", path: "/path/to/my/other/folder" },
 *          ],
 *        }
 *        The `content` property of this Object is mandatory, and must resemble the
 *        above example. Other free-form information can as well be stored in the
 *        Object, to aid in the process.
 *
 * @param {Function} [monitoringFn=null]
 *        Optional function to receive real-time monitoring information.
 *        Expected signature/arguments structure is: onMonitoringInfo
 *        ({type:"info|warn|error", message:"<any>"[, data : {}]});
 */
function ensureSetup(homeDir, bluePrint, monitoringFn = null) {
  const $m = monitoringFn || function () {};

  try {
    // Sort content by path alphabetically
    bluePrint.content.sort((a, b) => a.path.localeCompare(b.path));

    // Ensure all directories and files exist
    for (const item of bluePrint.content) {
      const itemPath = path.join(homeDir, item.path);

      if (item.type === "folder") {
        // Create folder if it doesn't exist
        if (!fs.existsSync(itemPath)) {
          fs.mkdirSync(itemPath, { recursive: true });
          $m({ type: "info", message: `Created folder: ${itemPath}` });
        }
      } else if (item.type === "file") {
        // Ensure the parent directory exists
        const dir = path.dirname(itemPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          $m({
            type: "info",
            message: `Created parent directory for file: ${dir}`,
          });
        }

        // Create and populate the file based on the template and data
        const content = populateTemplate(item.template, item.data);
        fs.writeFileSync(itemPath, content, "utf8");
        $m({ type: "info", message: `Created file: ${itemPath}` });
      }
    }
  } catch (error) {
    $m({
      type: "error",
      message: `Error in ensureSetup. Details: ${error.message}`,
      data: { error },
    });
  }
}

/**
 * Populates a template with data.
 * @param {String} template - The template string with placeholders.
 * @param {Object} data - The data object with key-value pairs for placeholders.
 * @return {String} The populated template.
 */
function populateTemplate(template, data) {
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    if (key in data) {
      return data[key];
    } else {
      return `{{${key}}}`;
    }
  });
}

module.exports = {
  removeFolderContents,
  archiveArticles,
  mergeArticles,
  ensureSetup,
};
