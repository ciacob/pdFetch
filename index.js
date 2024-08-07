const fs = require("fs").promises;
const path = require("path");
const {
  getArticlesList,
  fetchArticles,
  getKBChanges,
} = require("./pdfetch_modules/core/sn_tools");
const {
  removeFolderContents,
  archiveArticles,
  mergeArticles,
  ensureSetup,
} = require("./pdfetch_modules/core/fs_tools");
const {
  getArguments,
  getHelp,
  getConfigData,
} = require("./pdfetch_modules/core/config_tools");
const {
  resetWorkspace,
  doListingOnly,
  doListingWithChanges,
  doListingWithFiles,
  doChangesWithFiles,
} = require("./pdfetch_modules/business/operation");

// TESTS:
// GET a sample of all the Goodman articles as local PDF files.
const monitoringFn = (info) => {
  console.log(`[${info.type.toUpperCase()}] ${info.message}`, info.data || "");
};
const targetFolder = "c:\\Users\\claud\\_pdFetch_playground\\";

(async function test() {
  const targetFile = path.join(targetFolder, "file_list.json");

  // 1. Clear the target folder.
  await removeFolderContents(targetFolder, null, monitoringFn);

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
  const pdfHome = path.join(targetFolder, "PDFs");
  await fs.mkdir(pdfHome);
  articleNames.length = 25; // Limit load for testing purposes
  console.log("SAMPLE of articles is: ", articleNames);
  await fetchArticles(
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    articleNames,
    pdfHome,
    false,
    monitoringFn
  );
}); //();

(async function test2() {
  const currListFile = path.join(targetFolder, "file_list.json");
  const olderListFile = path.join(targetFolder, "file_list.json.old");
  const targetChangesFile = path.join(targetFolder, "file_changes.json");
  getKBChanges(currListFile, olderListFile, targetChangesFile, monitoringFn);
}); //();

(async function test3() {
  await removeFolderContents(targetFolder, null, monitoringFn);
}); //();

(async function test4() {
  const currListFile = path.join(targetFolder, "file_list.json");
  const currListData = await fs.readFile(currListFile, "utf-8");
  const currList = JSON.parse(currListData);
  const articleNumbers = currList.map((listItem) => listItem.number);
  console.log("articleNumbers is: ", articleNumbers);
  archiveArticles(targetFolder, articleNumbers, "test_archive", monitoringFn);
}); //();

(async function test5() {
  const currListFile = path.join(targetFolder, "file_list.json");
  const currListData = await fs.readFile(currListFile, "utf-8");
  const currList = JSON.parse(currListData);
  const articleNumbers = currList.map((listItem) => listItem.number);
  console.log("articleNumbers is: ", articleNumbers);
  mergeArticles(targetFolder, articleNumbers, "test_merged_file", monitoringFn);
}); //();

(async function test6() {
  const dictionary = [
    { name: "Dry Run", payload: "--isDryRun", doc: "A simple flag argument" },
    { name: "Version", payload: /^--(version|v)/, doc: "Prints app version" },
    {
      name: "Home Directory",
      payload: /^--(homeDir)=(.+)/,
      doc: "Sets app home",
    },
    {
      name: "Parse Model",
      payload: /^--(parseModel)=(saasFile|raw)/,
      doc: 'Sets the parsing model to use; one of "saasFile" or "raw".',
    },
  ];
  const args = getArguments(dictionary, {}, monitoringFn);
  console.log("---> args:\n", args);
  console.log("HELP\n", getHelp(dictionary));
}); //();

(async function test7() {
  const bluePrint = {
    content: [
      {
        type: "file",
        path: "pdFetch.config",
        template: `{
	"app_info":{
		
	},
	"profiles":[
		{
			"name":"{{profileName}}",
			"description":"{{profileDescription}}",
			"settings":{
				"sn_instance_name":"{{instanceName}}",
				"sn_user_name":"{{userName}}",
				"sn_pass":"{{userPass}}",
				"sn_query":"",
				"output_dir":"{{targetDir}}",
				"storage_mode":"{{storageMode}}",
				"operation_mode":"{{operationMode}}"
			}
		}
	]
}`,
        data: {
          profileName: "Test Profile 1",
          profileDescription: "This is a test profile",
          instanceName: "gaiadev",
          userName: "table.api.user",
          userPass: "5n735T%uG371",
          targetDir: "./",
          storageMode: "files",
          operationMode: "invalid_value",
        },
      },
    ],
  };
  ensureSetup(targetFolder, bluePrint, monitoringFn);
}); //();

(async function test8() {
  const configFilePath = path.join(targetFolder, "pdFetch.config");

  const configData = getConfigData(
    configFilePath,
    "Test Profile 1",
    monitoringFn
  );
  console.log("configData is: ", configData);
}); //();

(async function test9() {
  resetWorkspace(targetFolder, monitoringFn);
});//();

(async function test10() {
  doListingOnly(
    targetFolder,
    "file_list",
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    "numberSTARTSWITHKB001181^sys_domain=292970ec978fe91041f8b38fe153af32",
    monitoringFn
  );
});//();

(async function test11() {
  doListingWithChanges(
    targetFolder,
    "file_list",
    "file_changes",
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    "numberSTARTSWITHKB001181^sys_domain=292970ec978fe91041f8b38fe153af32",
    monitoringFn
  );
});//();

(async function test12() {
  doListingWithFiles(
    targetFolder,
    "file_list",
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    "numberSTARTSWITHKB001181^sys_domain=292970ec978fe91041f8b38fe153af32",
    monitoringFn
  );
});//();

(async function test13() {
  doChangesWithFiles(
    targetFolder,
    "file_list",
    "file_changes",
    "gaiadev",
    "table.api.user",
    "5n735T%uG371",
    "numberSTARTSWITHKB001181^ORnumber=KB0012760^sys_domain=292970ec978fe91041f8b38fe153af32^workflow_state=published",
    monitoringFn
  );
});//();
